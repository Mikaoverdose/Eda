import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { SshAgent } from "@main/git/security/ssh-agent";
import { SshService } from "@main/ssh/ssh-service";
import { NodeProcessRunner } from "@main/git/execution/node-process-runner";
import { GitService } from "@main/git/git-service";
import { buildGitEnvironment } from "@main/git/execution/environment";
import { FakeProcessRunner } from "../../helpers/fake-process-runner";
import { sshTestEnvironment } from "../../helpers/ssh-environment";

const toolEnvironment = await sshTestEnvironment();

const agents: SshAgent[] = [];
const directories: string[] = [];
const engine = {
  source: "system" as const,
  path: "git",
  version: "2.56.0",
  versionParts: { major: 2, minor: 56, patch: 0 },
};
afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.stop()));
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
  vi.unstubAllEnvs();
});

it("leaves the inherited agent environment untouched in system mode", async () => {
  vi.stubEnv("SSH_AUTH_SOCK", "/system/agent");
  const agent = new SshAgent("system", "/does-not-exist");
  agents.push(agent);
  await agent.start();
  expect(agent.environment).toEqual({});
  await agent.stop();
  expect(process.env["SSH_AUTH_SOCK"]).toBe("/system/agent");
});

it("pins Git and connection tests to the owned agent even with transport overrides", async () => {
  const runner = new FakeProcessRunner().otherwise({ exitCode: 0 });
  const git = new GitService(runner, engine, { SSH_AUTH_SOCK: "/eda/agent" });
  await git.exec(["fetch"], {
    cwd: "/fixture",
    operation: "fixture",
    env: {
      overrides: {
        GIT_SSH_COMMAND: "ssh -i /fixture/key -o BatchMode=yes",
        SSH_AUTH_SOCK: "/other/agent",
      },
    },
  });
  expect(runner.lastCall?.env["SSH_AUTH_SOCK"]).toBe("/eda/agent");
  expect(runner.lastCall?.env["GIT_SSH_COMMAND"]).toBe(
    "ssh -i /fixture/key -o BatchMode=yes -o IdentityAgent=SSH_AUTH_SOCK",
  );
  const agent = new SshAgent("builtin");
  const ssh = new SshService(runner, undefined, { SSH_AUTH_SOCK: "/eda/agent" }, agent);
  await ssh.testConnection("git@example.invalid", "/fixture/key");
  expect(runner.lastCall?.args).toContain("IdentityAgent=SSH_AUTH_SOCK");
});

it("reports missing tools without falling back to inherited credentials", async () => {
  vi.stubEnv("SSH_AUTH_SOCK", "/system/agent");
  const agent = new SshAgent("builtin", "/does-not-exist/ssh-agent");
  agents.push(agent);
  await agent.start();
  expect(agent.unavailableReason).toContain("could not start");
  expect(agent.environment["SSH_AUTH_SOCK"]).toBe("");
  const service = new SshService(new NodeProcessRunner(), undefined, agent.environment, agent);
  expect(await service.getAgentStatus()).toMatchObject({ available: false, source: "builtin" });
  expect(process.env["SSH_AUTH_SOCK"]).toBe("/system/agent");
});

it("unlocks a disposable encrypted key for real Git signing and stops only its own agent", async () => {
  const runner = new NodeProcessRunner();
  const inherited = new SshAgent("builtin", "ssh-agent", toolEnvironment);
  agents.push(inherited);
  await inherited.start();
  expect(inherited.unavailableReason).toBeUndefined();
  const inheritedSocket = inherited.environment["SSH_AUTH_SOCK"]!;
  vi.stubEnv("SSH_AUTH_SOCK", inheritedSocket);
  const agent = new SshAgent("builtin", "ssh-agent", toolEnvironment);
  agents.push(agent);
  await Promise.all([agent.start(), agent.start()]);
  expect(agent.unavailableReason).toBeUndefined();
  const ownedSocket = agent.environment["SSH_AUTH_SOCK"]!;
  expect(ownedSocket).not.toBe(inheritedSocket);
  const home = await mkdtemp(join(tmpdir(), "eda-agent-key-"));
  directories.push(home);
  const key = join(home, "key");
  const env = buildGitEnvironment({
    overrides: { ...toolEnvironment, ...agent.environment, HOME: home },
  });
  const generated = await runner.run({
    executable: "ssh-keygen",
    args: ["-q", "-t", "ed25519", "-f", key, "-N", "disposable-test-passphrase"],
    env,
  });
  expect(generated.exitCode).toBe(0);
  const transportEnvironment = Object.assign(agent.environment, toolEnvironment);
  const ssh = new SshService(runner, home, transportEnvironment, agent);
  expect(await ssh.getAgentStatus()).toMatchObject({ available: true, keys: [] });
  const status = await ssh.unlockKey(
    { keyPath: key, lifetimeSeconds: 60 },
    "disposable-test-passphrase",
  );
  expect(status.available && status.keys.length).toBe(1);
  const git = new GitService(runner, engine, {
    ...toolEnvironment,
    ...agent.environment,
    HOME: home,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
  });
  await git.exec(["init", home], { cwd: home, operation: "init fixture" });
  await git.exec(
    [
      "-c",
      "user.name=Agent fixture",
      "-c",
      "user.email=agent@example.invalid",
      "-c",
      "gpg.format=ssh",
      "-c",
      `user.signingkey=${key}`,
      "commit",
      "--allow-empty",
      "-S",
      "-m",
      "Signed through Eda's agent",
    ],
    { cwd: home, operation: "sign fixture" },
  );
  const commit = await git.exec(["cat-file", "commit", "HEAD"], {
    cwd: home,
    operation: "read fixture",
  });
  expect(commit.stdout).toContain("gpgsig -----BEGIN SSH SIGNATURE-----");
  const systemKeys = await runner.run({
    executable: "ssh-add",
    args: ["-l"],
    env: buildGitEnvironment({ overrides: { ...toolEnvironment, ...inherited.environment } }),
  });
  expect(systemKeys.exitCode).toBe(1);
  await agent.reset();
  expect(agent.unavailableReason).toBeUndefined();
  expect(agent.environment["SSH_AUTH_SOCK"]).not.toBe(ownedSocket);
  expect(await ssh.getAgentStatus()).toMatchObject({ available: true, keys: [] });
  const pid = Number(agent.environment["SSH_AGENT_PID"]);
  await agent.stop();
  await expect(access(ownedSocket)).rejects.toThrow();
  expect(() => process.kill(pid, 0)).toThrow();
  expect(
    (
      await runner.run({
        executable: "ssh-add",
        args: ["-l"],
        env: buildGitEnvironment({ overrides: { ...toolEnvironment, ...inherited.environment } }),
      })
    ).exitCode,
  ).toBe(1);
  expect(process.env["SSH_AUTH_SOCK"]).toBe(inheritedSocket);
});
