import { expect, it, vi } from "vitest";
import { access, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { openInMemoryDatabase } from "@main/persistence/database";
import { RepositoryTrust } from "@main/git/security/repository-trust";
import { NodeProcessRunner } from "@main/git/execution/node-process-runner";
import { resolveGitEngine } from "@main/git/execution/git-engine";
import { GitService } from "@main/git/git-service";
import { createTempRepo } from "../../helpers/temp-repo";

it("blocks repository-selected programs before approval, including on background reads and directory replacement", async () => {
  const repo = await createTempRepo();
  const db = openInMemoryDatabase();
  try {
    await repo.writeFile(".gitattributes", "*.sample filter=fixture\n");
    await repo.writeFile("run.sample", "contents");
    await repo.run(["config", "filter.fixture.clean", "echo executed > marker; cat"]);
    const confirm = vi.fn(async () => false);
    const trust = new RepositoryTrust(db, confirm, repo.home);
    const runner = new NodeProcessRunner();
    const git = new GitService(
      runner,
      await resolveGitEngine(runner),
      {
        HOME: repo.home,
        GIT_CONFIG_GLOBAL: join(repo.home, ".gitconfig"),
        GIT_CONFIG_NOSYSTEM: "1",
      },
      undefined,
      trust,
    );
    expect(await git.isRepository(repo.path)).toBe(false);
    await expect(git.stageAll(repo.path)).rejects.toThrow();
    expect(confirm).not.toHaveBeenCalled();
    await expect(trust.authorize(repo.path)).rejects.toThrow();
    await expect(access(join(repo.path, "marker"))).rejects.toThrow();
    confirm.mockResolvedValue(true);
    await trust.authorize(repo.path);
    expect(await git.isRepository(repo.path)).toBe(true);
    await git.stageAll(repo.path);
    await access(join(repo.path, "marker"));
    await rename(join(repo.path, ".git"), join(repo.path, "old-metadata"));
    await mkdir(join(repo.path, ".git"));
    await expect(git.status(repo.path)).rejects.toThrow();
    expect(confirm).toHaveBeenCalledTimes(2);
  } finally {
    db.close();
    await repo.cleanup();
  }
});
