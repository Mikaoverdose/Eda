import { describe, expect, it } from "vitest";
import { GitError } from "@shared/errors";
import { FakeProcessRunner } from "../../helpers/fake-process-runner";
import { ProcessSpawnError } from "@main/git/execution/process-runner";
import { resolveGitEngine } from "@main/git/execution/git-engine";

const version = (text: string) => new FakeProcessRunner().otherwise({ stdout: text });

const missing = () => {
  const runner = new FakeProcessRunner();

  runner.run = async (request) => {
    throw new ProcessSpawnError(
      request.executable,
      Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }),
    );
  };

  return runner;
};

describe("resolving the Git engine", () => {
  it("reports the parsed version of system Git", async () => {
    const engine = await resolveGitEngine(version("git version 2.55.0\n"));

    expect(engine).toMatchObject({
      source: "system",
      path: "git",
      version: "2.55.0",
      versionParts: { major: 2, minor: 55, patch: 0 },
    });
  });

  it("treats a missing patch component as zero", async () => {
    const engine = await resolveGitEngine(version("git version 2.44\n"));
    expect(engine.versionParts).toEqual({ major: 2, minor: 44, patch: 0 });
    expect(engine.version).toBe("2.44.0");
  });

  it("parses the platform suffixes Git ships on macOS and Windows", async () => {
    const apple = await resolveGitEngine(version("git version 2.44.5 (Apple Git-154)\n"));
    expect(apple.versionParts).toMatchObject({ major: 2, minor: 44, patch: 5 });

    const windows = await resolveGitEngine(version("git version 2.47.1.windows.1\n"));
    expect(windows.versionParts).toMatchObject({ major: 2, minor: 47, patch: 1 });
  });

  it("probes with an isolated config so a user gitconfig cannot change the answer", async () => {
    const runner = version("git version 2.55.0\n");
    await resolveGitEngine(runner);
    expect(runner.lastCall?.args).toEqual(["--version"]);
    expect(runner.lastCall?.env?.["GIT_CONFIG_GLOBAL"]).toBe("/dev/null");
    expect(runner.lastCall?.env?.["GIT_CONFIG_SYSTEM"]).toBe("/dev/null");
  });
});

describe("engine preference", () => {
  it("uses bundled Git by default even when system Git is available", async () => {
    const runner = version("git version 2.56.0\n");
    const engine = await resolveGitEngine(runner, {
      bundledPath: "/eda/git",
      bundledEnvironment: { PATH: "/eda/tools", GIT_EXEC_PATH: "/eda/helpers" },
    });

    expect(engine.source).toBe("bundled");
    expect(runner.lastCall?.executable).toBe("/eda/git");
    expect(engine.environment?.["GIT_EXEC_PATH"]).toBe("/eda/helpers");
    expect(runner.lastCall?.env?.["PATH"]).toBe("/eda/tools");
  });

  it("honors system selection without leaking bundled helper paths", async () => {
    const engine = await resolveGitEngine(version("git version 2.56.0"), {
      preferred: "system",
      bundledPath: "/eda/git",
      bundledEnvironment: { GIT_EXEC_PATH: "/eda/helpers" },
    });

    expect(engine.source).toBe("system");
    expect(engine.environment).toBeUndefined();
  });

  it("recovers to the bundle if a selected system installation disappears", async () => {
    const runner = new FakeProcessRunner()
      .when((request) => request.executable === "git", { exitCode: 1 })
      .otherwise({ stdout: "git version 2.56.0" });
    expect(
      (await resolveGitEngine(runner, { preferred: "system", bundledPath: "/eda/git" })).source,
    ).toBe("bundled");
  });

  it("prefers the custom path when asked", async () => {
    const engine = await resolveGitEngine(version("git version 2.55.0\n"), {
      preferred: "custom",
      customPath: "/usr/local/bin/git",
    });
    expect(engine).toMatchObject({ source: "custom", path: "/usr/local/bin/git" });
  });

  it("prefers the bundled path when asked", async () => {
    const engine = await resolveGitEngine(version("git version 2.55.0\n"), {
      preferred: "bundled",
      bundledPath: "/opt/eda/git",
    });
    expect(engine).toMatchObject({ source: "bundled", path: "/opt/eda/git" });
  });

  it("falls back to system Git when the preferred engine does not work", async () => {
    const runner = new FakeProcessRunner()
      .when((request) => request.executable === "/broken/git", { exitCode: 127 })
      .otherwise({ stdout: "git version 2.55.0\n" });

    const engine = await resolveGitEngine(runner, {
      preferred: "custom",
      customPath: "/broken/git",
    });

    expect(engine).toMatchObject({ source: "system", path: "git" });
  });

  it("ignores a preference whose path was never supplied", async () => {
    const engine = await resolveGitEngine(version("git version 2.55.0\n"), { preferred: "custom" });
    expect(engine.source).toBe("system");
  });
});

describe("when no engine works", () => {
  it("raises git-not-found rather than a raw spawn error", async () => {
    await expect(resolveGitEngine(missing())).rejects.toMatchObject({
      kind: "git-not-found",
      operation: "locate Git",
    });
  });

  it("suggests an action the user can actually take", async () => {
    const error = await resolveGitEngine(missing()).catch((e: unknown) => e as GitError);
    expect(error).toBeInstanceOf(GitError);
    expect((error as GitError).suggestedAction).toMatch(/install git/i);
  });

  it("records why every candidate failed, for the log", async () => {
    const error = await resolveGitEngine(missing(), {
      preferred: "custom",
      customPath: "/nope/git",
    }).catch((e: unknown) => e as GitError);

    expect((error as GitError).rawStderr).toContain("/nope/git");
    expect((error as GitError).rawStderr).toContain("ENOENT");
  });

  it("rejects a binary whose output is not a Git version banner", async () => {
    await expect(resolveGitEngine(version("not git at all\n"))).rejects.toMatchObject({
      kind: "git-not-found",
    });
  });

  it("rejects a non-zero exit from --version", async () => {
    const runner = new FakeProcessRunner().otherwise({ exitCode: 1, stdout: "" });
    await expect(resolveGitEngine(runner)).rejects.toMatchObject({ kind: "git-not-found" });
  });
});

describe("the minimum supported version", () => {
  it("accepts the documented minimum and anything newer", async () => {
    for (const banner of ["git version 2.44.0", "git version 2.45.0", "git version 3.0.0"]) {
      await expect(resolveGitEngine(version(banner))).resolves.toBeDefined();
    }
  });

  it("rejects Git older than the minimum, naming the requirement", async () => {
    const error = await resolveGitEngine(version("git version 2.43.0")).catch(
      (e: unknown) => e as GitError,
    );
    expect((error as GitError).kind).toBe("git-not-found");
    expect((error as GitError).rawStderr).toContain("2.44");
  });

  it("rejects a major version below the minimum", async () => {
    await expect(resolveGitEngine(version("git version 1.9.5"))).rejects.toMatchObject({
      kind: "git-not-found",
    });
  });
});
