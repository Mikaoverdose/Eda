import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, type TempRepo } from "../../../helpers/temp-repo";
import { IgnoreService, ignoreRule } from "@main/repo/working-tree/ignore-service";

let repo: TempRepo;

afterEach(async () => {
  if (repo) await repo.cleanup();
});

describe("Git ignore rules", () => {
  it("escapes literal paths and rejects unsafe or meaningless selections", () => {
    expect(ignoreRule("build/[a]*.txt", "path")).toBe("/build/\\[a\\]\\*.txt");
    expect(ignoreRule("build/file.txt", "directory")).toBe("/build/");
    expect(ignoreRule("build/file.txt", "extension")).toBe("*.txt");
    expect(() => ignoreRule("../outside", "path")).toThrow();
    expect(() => ignoreRule("file.txt", "directory")).toThrow();
  });

  it("asks Git to explain nested, local and global exclusions including negation", async () => {
    repo = await createTempRepo();

    const ignore = new IgnoreService(repo.git);

    await repo.writeFile("nested/.gitignore", "*.log\n!important.log\n");
    await repo.writeFile("nested/file.log", "local");
    await repo.writeFile("nested/important.log", "keep");
    expect(await ignore.inspect(repo.path, "nested/file.log", "path")).toMatchObject({
      ignored: true,
      source: "nested/.gitignore",
      pattern: "*.log",
      line: "1",
    });
    expect(await ignore.inspect(repo.path, "nested/important.log", "path")).toMatchObject({
      ignored: false,
      pattern: "!important.log",
    });

    await repo.writeFile(".git/info/exclude", "*.cache\n");
    expect(await ignore.inspect(repo.path, "file.cache", "path")).toMatchObject({
      ignored: true,
      pattern: "*.cache",
    });

    await repo.writeFile("global-ignore", "*.private\n");
    await repo.run(["config", "core.excludesFile", join(repo.path, "global-ignore")]);
    expect(await ignore.inspect(repo.path, "file.private", "path")).toMatchObject({
      ignored: true,
      pattern: "*.private",
    });
  });

  it("adds a rule without altering tracked content; stopping tracking keeps disk content", async () => {
    repo = await createTempRepo();
    await repo.writeFile("file.log", "keep these bytes\r\n");
    await repo.commit("initial");
    await repo.writeFile(".gitignore", "# existing\r\n");

    const ignore = new IgnoreService(repo.git);

    await ignore.add(repo.path, "file.log", "path");
    await ignore.add(repo.path, "file.log", "path");
    expect(await readFile(join(repo.path, ".gitignore"), "utf8")).toBe(
      "# existing\r\n/file.log\r\n",
    );
    expect(await ignore.inspect(repo.path, "file.log", "path")).toMatchObject({
      tracked: true,
      ignored: true,
    });

    await ignore.stopTracking(repo.path, "file.log");
    expect(await readFile(join(repo.path, "file.log"), "utf8")).toBe("keep these bytes\r\n");
    expect(await repo.run(["diff", "--cached", "--name-status"])).toContain("D\tfile.log");
  });
});
