import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server, type Socket } from "node:net";
import ssh2 from "ssh2";
import { NodeProcessRunner } from "@main/git/execution/node-process-runner";
import { buildGitEnvironment } from "@main/git/execution/environment";
import { GitService } from "@main/git/git-service";
import { transportOptions } from "@main/git/operations/remotes";
import {
  parseSshHostPrompt,
  SshHostTrustRunner,
  type ConfirmSshHost,
} from "@main/git/security/ssh-host-trust";
import type { ProcessRunner } from "@main/git/execution/process-runner";
import { SshService } from "@main/ssh/ssh-service";
import { sshTestEnvironment } from "../../helpers/ssh-environment";

const toolEnvironment = await sshTestEnvironment();

const fingerprint = `SHA256:${"a".repeat(43)}`;
const prompt = `The authenticity of host '[localhost]:2222 (127.0.0.1)' can't be established.\nED25519 key fingerprint is ${fingerprint}.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? `;

it("releases askpass on cancellation before waiting for the process to close", async () => {
  const controller = new AbortController();
  const confirm = vi.fn(() => {
    controller.abort();
    return new Promise<boolean>(() => {});
  });
  const runner = new SshHostTrustRunner(
    {
      run: async (request) => {
        const directory = request.env["EDA_SSH_TRUST_DIR"]!;
        const path = join(directory, "request.12345678");
        await mkdir(path);
        await writeFile(join(path, "prompt"), prompt);
        await writeFile(join(path, "ready"), "");
        await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" }));
        return { exitCode: 130, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), cancelled: true };
      },
    },
    confirm,
  );

  await expect(
    runner.run({
      executable: "ssh",
      args: [],
      env: { EDA_SSH_HOST_TRUST: "1" },
      signal: controller.signal,
    }),
  ).resolves.toMatchObject({ cancelled: true });
});

it("cancels a queued request without waiting for another operation's modal", async () => {
  const directories: string[] = [];
  const confirm = vi.fn(async () => new Promise<boolean>(() => {}));
  const runner = new SshHostTrustRunner(
    {
      run: async (request) => {
        const directory = request.env["EDA_SSH_TRUST_DIR"]!;
        const path = join(directory, "request.12345678");
        await mkdir(path);
        await writeFile(join(path, "prompt"), prompt);
        await writeFile(join(path, "ready"), "");
        directories.push(directory);

        const signal = request.signal!;

        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else signal.addEventListener("abort", () => resolve(), { once: true });
        });
        await vi.waitFor(() => expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" }));

        return { exitCode: 130, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), cancelled: true };
      },
    },
    confirm,
  );
  const first = new AbortController();
  const second = new AbortController();
  const request = { executable: "ssh", args: [], env: { EDA_SSH_HOST_TRUST: "1" } };
  const pendingFirst = runner.run({ ...request, signal: first.signal });
  let pendingSecond: ReturnType<typeof runner.run> | undefined;

  try {
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    pendingSecond = runner.run({ ...request, signal: second.signal });
    await vi.waitFor(() => expect(directories).toHaveLength(2));

    second.abort();

    expect(await pendingSecond).toMatchObject({ cancelled: true });
    expect(confirm).toHaveBeenCalledOnce();
    expect(first.signal.aborted).toBe(false);
    await access(directories[0]!);
  } finally {
    first.abort();
    second.abort();
    await Promise.all([pendingFirst, pendingSecond]);
  }
});

it("extracts only the first-contact host and its complete SHA256 fingerprint", () => {
  expect(parseSshHostPrompt(prompt)).toEqual({
    host: "[localhost]:2222 (127.0.0.1)",
    algorithm: "ED25519",
    fingerprint,
  });
  expect(parseSshHostPrompt(prompt.replace("fingerprint is ", "fingerprint is: "))).not.toBeNull();
  expect(parseSshHostPrompt(prompt.replace(fingerprint, `${fingerprint}extra`))).toBeNull();
});

it.each([
  "Enter passphrase for key '/fixture/key': ",
  "git@example.com's password: ",
  "WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!",
  "Please type 'yes' or 'no': ",
  prompt.replace("ED25519 key fingerprint", "unrecognized key fingerprint"),
  prompt.replace("localhost", "local\x1bhost"),
])("does not turn another SSH prompt into permission to trust a host: %s", (text) => {
  expect(parseSshHostPrompt(text)).toBeNull();
});

describe("host trust during real SSH connections", () => {
  let home: string;
  let server: Server;
  let port: number;
  let knownHosts: string;
  let key: string;
  let wrongHostKey: string;
  let configuredRunner: ProcessRunner;
  let authenticated: number;
  const sockets = new Set<Socket>();

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "eda host trust-"));
    const raw = new NodeProcessRunner();
    const env = buildGitEnvironment({ overrides: toolEnvironment });
    key = join(home, "client");
    const hostKey = join(home, "host");
    wrongHostKey = join(home, "other-host");
    await Promise.all(
      [key, hostKey, wrongHostKey].map(async (path) => {
        const generated = await raw.run({
          executable: "ssh-keygen",
          args: ["-q", "-t", "ed25519", "-f", path, "-N", "", "-C", "fixture@example.test"],
          env,
        });
        expect(generated.exitCode).toBe(0);
      }),
    );
    knownHosts = join(home, "known_hosts");
    const config = join(home, "ssh_config");
    await writeFile(
      config,
      `Host *\n  UserKnownHostsFile "${knownHosts.replaceAll("\\", "/")}"\n  GlobalKnownHostsFile /dev/null\n`,
    );
    configuredRunner = {
      run: (request) =>
        raw.run({
          ...request,
          args: request.executable === "ssh" ? ["-F", config, ...request.args] : request.args,
          env: {
            ...request.env,
            ...toolEnvironment,
            ...(request.env["GIT_SSH_COMMAND"] && {
              GIT_SSH_COMMAND: request.env["GIT_SSH_COMMAND"].replace(
                /^ssh\b/,
                `ssh -F "${config.replaceAll("\\", "/")}"`,
              ),
            }),
          },
        }),
    };
    authenticated = 0;
    const sshServer = new ssh2.Server({ hostKeys: [await readFile(hostKey)] }, (client) => {
      client.on("error", () => {});
      client.on("authentication", (context) => {
        if (context.method === "publickey") context.accept();
        else context.reject();
      });
      client.on("ready", () => {
        authenticated++;
        client.on("session", (accept) => {
          const session = accept();
          session.on("shell", (accept) => {
            const stream = accept();
            stream.stderr.write(
              "Hi fixture! You've successfully authenticated, but this server does not provide shell access.\n",
            );
            stream.exit(1);
            stream.end();
          });
          session.on("exec", (accept, _reject, info) => {
            const stream = accept();

            if (info.command.startsWith("git-upload-pack")) {
              stream.on("end", () => {
                stream.exit(0);
                stream.end();
              });

              stream.resume();
              stream.write("0000");

              return;
            }

            stream.stderr.write(
              "Hi fixture! You've successfully authenticated, but this server does not provide shell access.\n",
            );
            stream.exit(1);
            stream.end();
          });
        });
      });
    });

    server = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      sshServer.injectSocket(socket);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });

  afterEach(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  });

  const destination = () => `git@127.0.0.1:${port}`;

  it("waits for approval, saves the exact server key, and reuses trust on the next test", async () => {
    let approve: ((value: boolean) => void) | undefined;
    const confirm = vi.fn<ConfirmSshHost>(
      () =>
        new Promise<boolean>((resolve) => {
          approve = resolve;
        }),
    );
    const ssh = new SshService(new SshHostTrustRunner(configuredRunner, confirm), home);
    const pending = ssh.testConnection(destination(), key);
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce(), { timeout: 10_000 });
    expect(authenticated).toBe(0);
    expect(await readFile(knownHosts, "utf8").catch(() => "")).toBe("");
    const actualFingerprint = await new NodeProcessRunner().run({
      executable: "ssh-keygen",
      args: ["-lf", join(home, "host.pub"), "-E", "sha256"],
      env: buildGitEnvironment({ overrides: toolEnvironment }),
    });
    expect(actualFingerprint.stdout.toString()).toContain(confirm.mock.calls[0]![0].fingerprint);
    approve!(true);
    expect(await pending).toMatchObject({ status: "authenticated", authenticatedAs: "fixture" });
    expect(await readFile(knownHosts, "utf8")).toContain(
      (await readFile(join(home, "host.pub"), "utf8")).split(" ")[1],
    );
    expect(await ssh.testConnection(destination(), key)).toMatchObject({ status: "authenticated" });
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("cancels without saving a host key or sending authentication when trust is declined", async () => {
    const confirm = vi.fn(async () => false);
    const ssh = new SshService(new SshHostTrustRunner(configuredRunner, confirm), home);
    await expect(ssh.testConnection(destination(), key)).rejects.toMatchObject({
      kind: "cancelled",
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(authenticated).toBe(0);
    expect(await readFile(knownHosts, "utf8").catch(() => "")).toBe("");
  });

  it("refuses a changed host key without offering to replace the saved key", async () => {
    const saved = `[127.0.0.1]:${port} ${await readFile(`${wrongHostKey}.pub`, "utf8")}`;
    await writeFile(knownHosts, saved);
    const confirm = vi.fn(async () => true);
    const ssh = new SshService(new SshHostTrustRunner(configuredRunner, confirm), home);
    expect(await ssh.testConnection(destination(), key)).toMatchObject({
      status: "host-key-changed",
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(authenticated).toBe(0);
    expect(await readFile(knownHosts, "utf8")).toBe(saved);
  });

  it("uses the same confirmation while a Git remote operation is pending", async () => {
    const confirm = vi.fn(async () => true);
    const git = new GitService(new SshHostTrustRunner(configuredRunner, confirm), {
      source: "system",
      path: "git",
      version: "2.56.0",
      versionParts: { major: 2, minor: 56, patch: 0 },
    });
    const url = `ssh://git@127.0.0.1:${port}/fixture.git`;
    await expect(
      git.exec(["ls-remote", url], {
        cwd: home,
        operation: "inspect remote",
        ...transportOptions(url, { name: "Fixture", sshKeyPath: key }),
      }),
    ).resolves.toMatchObject({ exitCode: 0 });
    expect(confirm).toHaveBeenCalledOnce();
    expect(await readFile(knownHosts, "utf8")).not.toBe("");
  });

  it("closes an outstanding confirmation when its Git operation is cancelled", async () => {
    let promptSignal: AbortSignal | undefined;
    const confirm = vi.fn((_prompt, signal: AbortSignal) => {
      promptSignal = signal;
      return new Promise<boolean>(() => {});
    });
    const runner = new SshHostTrustRunner(configuredRunner, confirm);
    const controller = new AbortController();
    const pending = runner.run({
      executable: "ssh",
      args: ["-T", "-o", "StrictHostKeyChecking=ask", "-p", String(port), "git@127.0.0.1"],
      env: buildGitEnvironment({ overrides: { EDA_SSH_HOST_TRUST: "1" } }),
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce(), { timeout: 10_000 });
    controller.abort();
    expect(await pending).toMatchObject({ cancelled: true });
    expect(promptSignal?.aborted).toBe(true);
    expect(await readFile(knownHosts, "utf8").catch(() => "")).toBe("");
  });
});
