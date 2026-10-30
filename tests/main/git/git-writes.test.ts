import { afterEach, describe, expect, it } from "vitest";
import { GitError } from "@shared/errors";
import { createTempRepo, type TempRepo } from "../../helpers/temp-repo";

let repos: TempRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.map((repo) => repo.cleanup()));
  repos = [];
});

const make = async () => {
  const repo = await createTempRepo({ init: true });
  repos.push(repo);
  return repo;
};

const staged = async (repo: TempRepo) =>
  (await repo.git.status(repo.path)).changes
    .filter((c) => c.index !== "." && c.kind !== "untracked")
    .map((c) => c.path);

describe("staging against real Git", () => {
  it("stages and unstages a single file", async () => {
    const repo = await make();

    await repo.writeFile("a.txt", "one");
    await repo.commit("initial");
    await repo.writeFile("a.txt", "two");

    await repo.git.stage(repo.path, ["a.txt"]);
    expect(await staged(repo)).toEqual(["a.txt"]);

    await repo.git.unstage(repo.path, ["a.txt"]);
    expect(await staged(repo)).toEqual([]);
  });

  it("stages and unstages everything", async () => {
    const repo = await make();

    await repo.writeFile("a.txt", "one");
    await repo.commit("initial");
    await repo.writeFile("a.txt", "changed");
    await repo.writeFile("b.txt", "new");

    await repo.git.stageAll(repo.path);
    expect((await staged(repo)).sort()).toEqual(["a.txt", "b.txt"]);

    await repo.git.unstageAll(repo.path);
    expect(await staged(repo)).toEqual([]);
  });

  it("unstages on an unborn branch, where there is no HEAD", async () => {
    const repo = await make();

    await repo.writeFile("a.txt", "one");

    await repo.git.stage(repo.path, ["a.txt"]);
    expect(await staged(repo)).toEqual(["a.txt"]);

    await repo.git.unstage(repo.path, ["a.txt"]);

    const status = await repo.git.status(repo.path);

    expect(status.changes.map((c) => c.kind)).toEqual(["untracked"]);
  });

  it("tolerates unstaging everything when nothing is staged", async () => {
    const repo = await make();
    await expect(repo.git.unstageAll(repo.path)).resolves.toBeUndefined();
  });

  it("stages a file whose name looks like an option", async () => {
    const repo = await make();
    await repo.writeFile("--cached", "hostile");

    await repo.git.stage(repo.path, ["--cached"]);
    expect(await staged(repo)).toEqual(["--cached"]);
  });
});

describe("committing against real Git", () => {
  it("commits staged work and returns the new oid", async () => {
    const repo = await make();

    await repo.writeFile("a.txt", "one");
    await repo.git.stageAll(repo.path);

    const oid = await repo.git.commit(repo.path, "feat: first");

    expect(oid).toMatch(/^[0-9a-f]{40,64}$/);
    expect(await repo.run(["log", "-1", "--format=%s"])).toContain("feat: first");
  });

  it("keeps subject and body intact through stdin", async () => {
    const repo = await make();

    await repo.writeFile("a.txt", "one");
    await repo.git.stageAll(repo.path);

    await repo.git.commit(repo.path, "feat: subject\n\nA body paragraph.\n");
    expect(await repo.run(["log", "-1", "--format=%s"])).toContain("feat: subject");
    expect(await repo.run(["log", "-1", "--format=%b"])).toContain("A body paragraph.");
  });

  it("accepts a message that looks like an option", async () => {
    const repo = await make();
    await repo.writeFile("a.txt", "one");
    await repo.git.stageAll(repo.path);

    await repo.git.commit(repo.path, "--amend is a scary subject");
    expect(await repo.run(["log", "-1", "--format=%s"])).toContain("--amend is a scary subject");
  });

  it("amends without creating a second commit", async () => {
    const repo = await make();

    await repo.writeFile("a.txt", "one");
    await repo.commit("original");

    await repo.writeFile("a.txt", "two");
    await repo.git.stageAll(repo.path);
    await repo.git.commit(repo.path, "amended", { amend: true });

    expect((await repo.run(["rev-list", "--count", "HEAD"])).trim()).toBe("1");
    expect(await repo.run(["log", "-1", "--format=%s"])).toContain("amended");
  });

  it("refuses an empty message rather than opening an editor", async () => {
    const repo = await make();
    await repo.writeFile("a.txt", "one");
    await repo.git.stageAll(repo.path);

    await expect(repo.git.commit(repo.path, "   \n  ")).rejects.toBeInstanceOf(GitError);
  });

  it("surfaces a typed error when there is nothing staged", async () => {
    const repo = await make();
    await repo.writeFile("a.txt", "one");
    await repo.commit("initial");

    await expect(repo.git.commit(repo.path, "nothing to do")).rejects.toBeInstanceOf(GitError);
  });
});
