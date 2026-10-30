import { t } from "@shared/i18n";
import { GitError } from "@shared/errors";
import type { GpgSigningKey } from "@shared/identity/signing";
import { buildGitEnvironment } from "../execution/environment";
import type { GitService } from "../git-service";
import { ProcessSpawnError, type ProcessRunner } from "../execution/process-runner";

export class GpgKeyService {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly git: Pick<GitService, "readConfig">,
    private readonly environment: Readonly<Record<string, string>> = {},
  ) {}

  async listSigningKeys(): Promise<GpgSigningKey[]> {
    const executable =
      (await this.git.readConfig("gpg.openpgp.program", { scope: "global" })) ??
      (await this.git.readConfig("gpg.program", { scope: "global" })) ??
      "gpg";
    const operation = t("operations.detectGpgSigningKeys");

    try {
      const result = await this.runner.run({
        executable,
        args: [
          "--batch",
          "--no-tty",
          "--no-auto-check-trustdb",
          "--fixed-list-mode",
          "--with-colons",
          "--with-fingerprint",
          "--with-subkey-fingerprint",
          "--list-secret-keys",
        ],
        env: buildGitEnvironment({ overrides: this.environment }),
        signal: AbortSignal.timeout(10_000),
        maxStdoutBytes: 1024 * 1024,
        maxStderrBytes: 64 * 1024,
      });

      if (result.cancelled || result.outputLimitExceeded || result.exitCode !== 0) {
        throw new GitError({
          kind: result.outputLimitExceeded ? "output-too-large" : "unknown",
          operation,
          message: result.cancelled
            ? t("main.git.gpgKeys.gpgTookTooLongToListSigningKeys")
            : result.outputLimitExceeded
              ? t("main.git.gpgKeys.theGpgKeyListIsTooLargeToLoad")
              : t("main.git.gpgKeys.gpgCouldNotReadYourSigningKeys"),
          suggestedAction: t(
            "main.git.gpgKeys.checkYourGnuPgInstallationAndKeyringThenRefreshTheKeys",
          ),
        });
      }

      return parseGpgSigningKeys(result.stdout.toString("utf8"));
    } catch (error) {
      if (error instanceof ProcessSpawnError) {
        throw new GitError({
          kind: "git-not-found",
          operation,
          message: t("main.git.gpgKeys.gpgIsUnavailable"),
          suggestedAction: t("main.git.gpgKeys.installGnuPgOnYourPathOrSet"),
        });
      }

      throw error;
    }
  }
}

interface KeyPart {
  fingerprint: string;
  keyId: string;
  expiresAt: number | null;
  valid: boolean;
  canSign: boolean;
}

export function parseGpgSigningKeys(output: string, now = Date.now() / 1000): GpgSigningKey[] {
  const keys: GpgSigningKey[] = [];
  let primary: KeyPart | undefined;
  let part: KeyPart | undefined;
  let parts: KeyPart[] = [];
  let userIds: string[] = [];
  const finish = () => {
    if (!primary?.valid || !primary.fingerprint) return;

    const signing = parts.filter((key) => key.valid && key.canSign && key.fingerprint);

    if (!signing.length) return;

    keys.push({
      fingerprint: primary.fingerprint,
      keyId: primary.keyId,
      userIds: [...new Set(userIds)],
      signingFingerprints: signing.map((key) => key.fingerprint),
      expiresAt: primary.expiresAt,
    });
  };

  for (const line of output.split(/\r?\n/)) {
    const fields = line.split(":");
    const type = fields[0];

    if (type === "sec" || type === "ssb") {
      if (type === "sec") {
        finish();
        primary = undefined;
        parts = [];
        userIds = [];
      }

      const expiry = Number(fields[6] || 0);
      const capabilities = fields[11] ?? "";

      part = {
        fingerprint: "",
        keyId: fields[4] ?? "",
        expiresAt: expiry > 0 ? expiry : null,
        valid:
          !/[redi]/.test(fields[1] ?? "") &&
          !capabilities.includes("D") &&
          Number.isFinite(expiry) &&
          (expiry === 0 || expiry > now),
        canSign: capabilities.includes("s") && fields[14] !== "#",
      };
      parts.push(part);

      if (type === "sec") primary = part;
    } else if (type === "fpr" && part && !part.fingerprint) {
      const fingerprint = fields[9] ?? "";
      if (/^(?:[\dA-F]{40}|[\dA-F]{64})$/i.test(fingerprint))
        part.fingerprint = fingerprint.toUpperCase();
    } else if (type === "uid" && primary && !/[redi]/.test(fields[1] ?? "")) {
      const userId = decodeUserId(fields[9] ?? "");
      if (userId) userIds.push(userId);
    }
  }

  finish();

  return keys;
}

function decodeUserId(value: string): string {
  return value
    .replace(
      /((?:\\x[\da-f]{2})+)|\\([\\nrt"'])/gi,
      (_, hex: string | undefined, escaped: string) =>
        hex
          ? Buffer.from(hex.replace(/\\x/gi, ""), "hex").toString("utf8")
          : "nrt".includes(escaped)
            ? " "
            : escaped,
    )
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
}
