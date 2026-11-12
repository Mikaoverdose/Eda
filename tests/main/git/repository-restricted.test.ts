import { access, chmod } from "node:fs/promises";
import { join } from "node:path";
import { RepositoryTrust } from "@main/git/security/repository-trust";
import { RepositoryExecutionInspector } from "@main/git/security/repository-execution";
import { RepositoryTrustStore } from "@main/persistence/repository-trust-store";
import { RepositoryVolumeIdentity } from "@main/git/security/repository-volume";
import { openInMemoryDatabase } from "@main/persistence/database";
import { NodeProcessRunner } from "@main/git/execution/node-process-runner";
import { resolveGitEngine } from "@main/git/execution/git-engine";
import { GitService } from "@main/git/git-service";
import { createTempRepo } from "../../helpers/temp-repo";

async function fixture() {
  const repo = await createTempRepo();
  const db = openInMemoryDatabase();
  const runner = new NodeProcessRunner();
  const engine = await resolveGitEngine(runner);
  const env = {
    HOME: repo.home,
    USERPROFILE: repo.home,
    GIT_CONFIG_GLOBAL: join(repo.home, ".gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const confirm = vi.fn(async () => false);
  const inspector = new RepositoryExecutionInspector(runner, engine, env);
  const trust = new RepositoryTrust(
    new RepositoryTrustStore(db),
    confirm,
    repo.home,
    new RepositoryVolumeIdentity(runner),
    inspector,
  );
  const git = new GitService(runner, engine, env, undefined, trust);
  return {
    repo,
    confirm,
    trust,
    git,
    cleanup: async () => {
      db.close();
      await repo.cleanup();
    },
  };
}

it("opens ordinary repositories without prompting or granting execution trust", async () => {
  const f = await fixture();
  try {
    await f.repo.writeFile("README.md", "hello\n");
    await f.trust.authorize(f.repo.path);
    expect(f.confirm).not.toHaveBeenCalled();
    expect(await f.trust.isTrusted(f.repo.path)).toBe(false);
    expect((await f.trust.checked(f.repo.path)).trusted).toBe(false);
    await f.git.stageAll(f.repo.path);
    expect(await f.git.isRepository(f.repo.path)).toBe(true);
  } finally {
    await f.cleanup();
  }
});

it("keeps repository hooks disabled after declining and enables them only after approval", async () => {
  const f = await fixture();
  try {
    await f.repo.writeFile(".git/hooks/pre-commit", "#!/bin/sh\necho executed > marker\n");
    await chmod(join(f.repo.path, ".git/hooks/pre-commit"), 0o755);
    await f.trust.authorize(f.repo.path);
    expect(f.confirm).toHaveBeenCalledWith(f.repo.path, ["hooks/pre-commit"]);
    await f.git.exec(["commit", "--allow-empty", "-m", "restricted"], {
      cwd: f.repo.path,
      operation: "test",
    });
    await expect(access(join(f.repo.path, "marker"))).rejects.toThrow();
    f.confirm.mockResolvedValue(true);
    await f.trust.authorize(f.repo.path);
    await f.git.exec(["commit", "--allow-empty", "-m", "trusted"], {
      cwd: f.repo.path,
      operation: "test",
    });
    await access(join(f.repo.path, "marker"));
    expect(await f.trust.isTrusted(f.repo.path)).toBe(true);
    f.confirm.mockResolvedValue(false);
    await f.trust.authorize(f.repo.path, false, true);
    expect(await f.trust.isTrusted(f.repo.path)).toBe(false);
  } finally {
    await f.cleanup();
  }
});

it("detects globally configured filters activated by tracked attributes, permits browsing, and blocks writes", async () => {
  const f = await fixture();
  try {
    await f.repo.writeFile(".gitattributes", "*.filtered filter=fixture\n");
    await f.repo.writeFile("data.filtered", "hello\n");
    await f.repo.commit("fixture");
    await f.repo.run(["config", "--global", "filter.fixture.clean", "echo executed > marker; cat"]);
    await f.trust.authorize(f.repo.path);
    expect(f.confirm).toHaveBeenCalledWith(f.repo.path, ["filter.fixture"]);
    await f.git.status(f.repo.path);
    await expect(f.git.stageAll(f.repo.path)).rejects.toThrow(/disabled filters/);
    await expect(access(join(f.repo.path, "marker"))).rejects.toThrow();
    f.confirm.mockResolvedValue(true);
    await f.trust.authorize(f.repo.path);
    await f.repo.writeFile("data.filtered", "changed\n");
    await f.git.stageAll(f.repo.path);
    await access(join(f.repo.path, "marker"));
  } finally {
    await f.cleanup();
  }
});

it("does not prompt merely because a global filter exists", async () => {
  const f = await fixture();
  try {
    await f.repo.run(["config", "--global", "filter.fixture.clean", "cat"]);
    await f.trust.authorize(f.repo.path);
    expect(f.confirm).not.toHaveBeenCalled();
    await f.repo.writeFile("file.txt", "hello\n");
    await f.git.stageAll(f.repo.path);
    await f.repo.writeFile(".gitattributes", "*.txt filter=fixture\n");
    await expect(f.git.stageAll(f.repo.path)).rejects.toThrow(/disabled filters/);
  } finally {
    await f.cleanup();
  }
});

it("inspects a clone before checkout and leaves filtered files absent when trust is declined", async () => {
  const f = await fixture();
  try {
    await f.repo.writeFile(".gitattributes", "*.filtered filter=fixture\n");
    await f.repo.writeFile("data.filtered", "hello\n");
    await f.repo.commit("fixture");
    await f.repo.run([
      "config",
      "--global",
      "filter.fixture.smudge",
      "echo executed > marker; cat",
    ]);
    const target = join(f.repo.home, "clone");
    await f.git.exec(["clone", "--no-local", "--no-checkout", "--", f.repo.path, target], {
      operation: "test",
    });
    await f.trust.rememberCreated(target);
    await f.trust.authorize(target);
    expect(f.confirm).toHaveBeenCalledWith(target, ["filter.fixture"]);
    await expect(
      f.git.exec(["reset", "--hard", "HEAD"], { cwd: target, operation: "test" }),
    ).rejects.toThrow(/disabled filters/);
    await expect(access(join(target, "marker"))).rejects.toThrow();
    await expect(access(join(target, "data.filtered"))).rejects.toThrow();
    f.confirm.mockResolvedValue(true);
    await f.trust.authorize(target);
    await f.git.exec(["reset", "--hard", "HEAD"], { cwd: target, operation: "test" });
    await access(join(target, "data.filtered"));
    await access(join(target, "marker"));
    await f.trust.authorize(target, false, true);
    f.confirm.mockResolvedValue(false);
    await f.trust.authorize(target, false, true);
    expect((await f.trust.checked(target)).trusted).toBe(false);
  } finally {
    await f.cleanup();
  }
});

it("does not execute a newly selected filter when switching to a different branch", async () => {
  const f = await fixture();
  try {
    await f.repo.writeFile("README.md", "hello\n");
    await f.repo.commit("plain");
    await f.repo.run(["checkout", "-b", "filtered"]);
    await f.repo.writeFile(".gitattributes", "*.filtered filter=fixture\n");
    await f.repo.writeFile("data.filtered", "hello\n");
    await f.repo.commit("filtered");
    await f.repo.run(["checkout", "main"]);
    await f.repo.run([
      "config",
      "--global",
      "filter.fixture.smudge",
      "echo executed > marker; cat",
    ]);
    await f.trust.authorize(f.repo.path);
    expect(f.confirm).not.toHaveBeenCalled();
    await expect(
      f.git.exec(["checkout", "filtered"], { cwd: f.repo.path, operation: "test" }),
    ).rejects.toThrow();
    await expect(access(join(f.repo.path, "marker"))).rejects.toThrow();
    expect((await f.repo.run(["branch", "--show-current"])).trim()).toBe("main");
  } finally {
    await f.cleanup();
  }
});

it("detects tracked hook locations before checkout while ignoring inert script folders", async () => {
  const f = await fixture();
  try {
    await f.repo.writeFile(".githooks/post-checkout", "#!/bin/sh\necho executed > marker\n");
    await f.repo.commit("hooks");
    await f.trust.authorize(f.repo.path);
    expect(f.confirm).not.toHaveBeenCalled();
    await f.repo.run(["config", "--global", "core.hooksPath", ".githooks"]);
    const target = join(f.repo.home, "clone");
    await f.git.exec(["clone", "--no-local", "--no-checkout", "--", f.repo.path, target], {
      operation: "test",
    });
    await f.trust.rememberCreated(target);
    await f.trust.authorize(target);
    expect(f.confirm).toHaveBeenCalledWith(target, [".githooks/post-checkout"]);
    await f.git.exec(["read-tree", "-m", "-u", "HEAD"], { cwd: target, operation: "test" });
    await expect(access(join(target, "marker"))).rejects.toThrow();
  } finally {
    await f.cleanup();
  }
});
