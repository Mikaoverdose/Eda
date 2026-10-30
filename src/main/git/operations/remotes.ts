import { stateLabel } from "@shared/i18n/labels";
import { t } from "@shared/i18n";
import { GitError } from "@shared/errors";
import { redactDiagnostic } from "@shared/diagnostics";
import type {
  RemoteChange,
  RemoteSummary,
  TransportCredentials,
} from "@shared/integrations/remotes";
import type { Identity } from "@shared/identity/identity";
import type { GitService, GitExecOptions } from "../git-service";
import { assertValidRefName, assertAllowedRemoteUrl } from "../validation";
import { buildSshCommand, SSH_HOST_TRUST_OPTIONS } from "../execution/environment";

export function remoteError(message: string): GitError {
  return new GitError({
    kind: "invalid-input",
    operation: t("operations.remoteOperation"),
    message,
  });
}

export function remoteName(name: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(name))
    throw remoteError(t("main.git.remotes.useARemoteNameStartingWithALetter"));
}

export const remoteUrl = (value: string) =>
  assertAllowedRemoteUrl(value, t("operations.remoteOperation"));

export class GitRemotes {
  constructor(private readonly git: GitService) {}

  async list(path: string): Promise<RemoteSummary[]> {
    const { stdout } = await this.git.exec(["remote"], {
      cwd: path,
      operation: t("operations.listRemotes"),
    });
    const names = stdout.trim().split("\n").filter(Boolean);

    if (names.length > 100)
      throw remoteError(t("main.git.remotes.thisRepositoryHasMoreThan100RemotesManageIts"));

    return Promise.all(
      names.map(async (name) => {
        remoteName(name);

        const fetchUrls = await this.urls(path, name, false);
        const pushUrls = await this.urls(path, name, true);

        return {
          name,
          fetchUrls: fetchUrls.map(redactDiagnostic),
          pushUrls: pushUrls.map(redactDiagnostic),
        };
      }),
    );
  }

  async urls(path: string, name: string, push: boolean): Promise<string[]> {
    remoteName(name);
    const { stdout } = await this.git.exec(
      ["remote", "get-url", ...(push ? ["--push"] : []), "--all", name],
      { cwd: path, operation: t("operations.readRemoteDestination") },
    );
    return stdout.trim().split("\n").filter(Boolean);
  }

  async destination(path: string, name: string, push: boolean): Promise<string> {
    const urls = await this.urls(path, name, push);

    if (urls.length !== 1) throw remoteError(t("main.git.remotes.thisRemoteHasMultipleUrLsUseA"));

    const url = urls[0]!;

    remoteUrl(url);

    return url;
  }

  async change(path: string, change: RemoteChange): Promise<void> {
    remoteName(change.name);

    if (change.kind === "add" || change.kind === "url") remoteUrl(change.url);
    if (change.kind === "rename") remoteName(change.to);

    const args =
      change.kind === "add"
        ? ["add", change.name, change.url]
        : change.kind === "rename"
          ? ["rename", change.name, change.to]
          : change.kind === "remove"
            ? ["remove", change.name]
            : ["set-url", ...(change.push ? ["--push"] : []), change.name, change.url];

    if (change.kind === "url" && (await this.urls(path, change.name, change.push)).length > 1)
      throw remoteError(t("main.git.remotes.thisRemoteHasMultipleUrLsEditIts"));

    await this.git.exec(["remote", ...args], {
      cwd: path,
      operation: t("operations.remote", { kind: stateLabel(change.kind) }),
    });
  }

  async track(path: string, branch: string, upstream: string | null): Promise<void> {
    assertValidRefName(branch, t("operations.setUpstream"));

    if (upstream !== null) {
      assertValidRefName(upstream, t("operations.setUpstream"));
      if (!upstream.startsWith("refs/remotes/"))
        throw remoteError(t("main.git.remotes.chooseARemoteTrackingBranch"));
    }

    await this.git.exec(
      [
        "branch",
        ...(upstream === null ? ["--unset-upstream"] : [`--set-upstream-to=${upstream}`]),
        branch,
      ],
      { cwd: path, operation: t("operations.setUpstream") },
    );
  }

  async upstreamStates(path: string): Promise<Map<string, string>> {
    const { stdout } = await this.git.exec(
      ["for-each-ref", "--format=%(refname:short)%09%(upstream:track)", "refs/heads"],
      { cwd: path, operation: t("operations.inspectUpstreamTracking") },
    );

    return new Map(
      stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [name, state = ""] = line.split("\t");
          return [name!, state];
        }),
    );
  }
}

export function transportOptions(
  url: string,
  identity: Pick<Identity, "name" | "sshKeyPath">,
  credentials?: TransportCredentials,
): Pick<GitExecOptions, "env" | "identityName" | "redactValues"> {
  remoteUrl(url);

  const overrides: Record<string, string> = {
    GIT_ALLOW_PROTOCOL: "https:ssh:file",
    GCM_INTERACTIVE: "never",
    GIT_SSH_COMMAND: `${identity.sshKeyPath ? buildSshCommand(identity.sshKeyPath) : "ssh"} ${SSH_HOST_TRUST_OPTIONS.join(" ")}`,
    EDA_SSH_HOST_TRUST: "1",
  };
  const config: [string, string][] = [
    ["credential.helper", ""],
    ["core.askPass", ""],
    ["http.followRedirects", "false"],
    ["protocol.ext.allow", "never"],
  ];

  const redactValues: string[] = [];

  if (url.startsWith("https://")) {
    config.push(["http.extraHeader", ""], [`http.${url.replace(/\/$/, "")}/.extraHeader`, ""]);
  }

  if (credentials) {
    if (!url.startsWith("https://"))
      throw remoteError(t("main.git.remotes.httpsAuthenticationOnly"));

    if (
      !credentials.username ||
      !credentials.password ||
      credentials.username.includes(":") ||
      /[\r\n\0]/.test(credentials.username + credentials.password)
    )
      throw remoteError(t("main.git.remotes.enterAnHttpsUsernameAndTokenWithoutControlCharacters"));

    const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString(
      "base64",
    );

    config.push([
      `http.${url.replace(/\/$/, "")}/.extraHeader`,
      t("main.git.remotes.authorizationBasic", { encoded: encoded }),
    ]);
    redactValues.push(credentials.password, encoded);
  }

  config.forEach(([key, value], index) => {
    overrides[`GIT_CONFIG_KEY_${index}`] = key;
    overrides[`GIT_CONFIG_VALUE_${index}`] = value;
  });
  overrides["GIT_CONFIG_COUNT"] = String(config.length);

  return {
    identityName: identity.name,
    env: { ...(identity.sshKeyPath ? { sshKeyPath: identity.sshKeyPath } : {}), overrides },
    redactValues,
  };
}
