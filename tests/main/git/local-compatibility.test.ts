import { rename, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createTempRepo, type TempRepo } from "../../helpers/temp-repo";

let repo: TempRepo;

afterEach(async () => {
  if (repo) await repo.cleanup();
});

it("commits rename, deletion, Unicode, executable-bit and CRLF changes without rewriting file bytes", async () => {
  repo = await createTempRepo();
  await repo.run(["config", "core.autocrlf", "false"]);
  await repo.writeFile("old.txt", "rename unchanged\n");
  await repo.writeFile("deleted.txt", "delete me\n");
  await repo.writeFile("script.sh", "#!/bin/sh\necho hello\n");
  await repo.commit("initial");
  await rename(join(repo.path, "old.txt"), join(repo.path, "日本語 renamed.txt"));
  await rm(join(repo.path, "deleted.txt"));
  await repo.writeFile("crlf.txt", "first\r\nsecond\r\n");
  await repo.git.stageAll(repo.path);
  await repo.run(["update-index", "--chmod=+x", "script.sh"]);
  await repo.git.stage(repo.path, ["日本語 renamed.txt", "crlf.txt"]);
  await repo.run(["commit", "-m", "mixed changes"]);
  expect(await repo.run(["show", "HEAD:crlf.txt"])).toBe("first\r\nsecond\r\n");
  expect(await repo.run(["show", "HEAD:日本語 renamed.txt"])).toBe("rename unchanged\n");
  expect(await repo.run(["ls-tree", "HEAD", "script.sh"])).toContain("100755");
  expect(
    await repo.run(["diff-tree", "--no-commit-id", "--name-status", "-r", "-M", "HEAD"]),
  ).toMatch(/R100/);
  expect(await repo.run(["ls-tree", "HEAD", "deleted.txt"])).toBe("");
  expect(await readFile(join(repo.path, "crlf.txt"), "utf8")).toBe("first\r\nsecond\r\n");
});

it("stages a literal bracket filename without matching another file", async () => {
  repo = await createTempRepo();
  await repo.writeFile("[a].txt", "selected");
  await repo.writeFile("a.txt", "unselected");
  await repo.git.stage(repo.path, ["[a].txt"]);
  expect(await repo.run(["ls-files"])).toBe("[a].txt\n");
});

it("preserves a case-only rename using the filesystem capability detected by Git", async () => {
  repo = await createTempRepo();
  await repo.writeFile("Case.txt", "case-sensitive content\n");
  await repo.commit("original case");
  await repo.run(["mv", "Case.txt", "case.txt"]);
  await repo.git.stageAll(repo.path);
  await repo.run(["commit", "-m", "case rename"]);
  expect(await repo.run(["ls-tree", "--name-only", "HEAD"])).toBe("case.txt\n");
  expect(await repo.run(["show", "HEAD:case.txt"])).toBe("case-sensitive content\n");
});

it("uses configured clean and smudge filters through Git", async () => {
  repo = await createTempRepo();
  await repo.run(["config", "filter.fixture.clean", "sed s/WORKTREE/INDEX/g"]);
  await repo.run(["config", "filter.fixture.smudge", "sed s/INDEX/WORKTREE/g"]);
  await repo.run(["config", "filter.fixture.required", "true"]);
  await repo.writeFile(".gitattributes", "*.filtered filter=fixture\n");
  await repo.writeFile("file.filtered", "WORKTREE bytes\n");
  await repo.git.stageAll(repo.path);
  await repo.run(["commit", "-m", "filtered"]);
  expect(await repo.run(["show", "HEAD:file.filtered"])).toBe("INDEX bytes\n");

  await rm(join(repo.path, "file.filtered"));
  await repo.run(["restore", "--worktree", "--", "file.filtered"]);
  expect(await readFile(join(repo.path, "file.filtered"), "utf8")).toBe("WORKTREE bytes\n");
});

it("honors attributes for CRLF and UTF-16 without modifying working bytes", async () => {
  repo = await createTempRepo();
  await repo.writeFile(
    ".gitattributes",
    "*.txt text eol=crlf\n*.utf16 text working-tree-encoding=UTF-16LE\n",
  );
  await repo.writeFile("line.txt", "one\r\ntwo\r\n");

  const encoded = Buffer.from("日本語\r\n", "utf16le");

  await writeFile(join(repo.path, "encoded.utf16"), encoded);
  await repo.git.stageAll(repo.path);
  await repo.run(["commit", "-m", "attributes"]);
  expect(await repo.run(["show", "HEAD:line.txt"])).toBe("one\ntwo\n");
  expect(await repo.run(["show", "HEAD:encoded.utf16"])).toBe("日本語\n");
  expect(await readFile(join(repo.path, "encoded.utf16"))).toEqual(encoded);
  expect(await readFile(join(repo.path, "line.txt"), "utf8")).toBe("one\r\ntwo\r\n");
});

it("keeps long Unicode paths and symlink index modes intact", async () => {
  repo = await createTempRepo();
  await repo.run(["config", "core.longpaths", "true"]);

  const path = `${Array.from({ length: 5 }, (_, index) => `${index}-${"nested".repeat(8)}`).join("/")}/日本語.txt`;

  await repo.writeFile(path, "long path bytes\n");
  await repo.git.stage(repo.path, [path]);

  const blob = await repo.git.exec(["hash-object", "-w", "--stdin"], {
    cwd: repo.path,
    operation: "fixture symlink object",
    stdin: path,
  });

  await repo.run(["update-index", "--add", "--cacheinfo", `120000,${blob.stdout.trim()},link`]);
  await repo.run(["commit", "-m", "long path and symbolic link"]);
  expect(await repo.run(["show", `HEAD:${path}`])).toBe("long path bytes\n");
  expect(await repo.run(["ls-tree", "HEAD", "link"])).toContain("120000");
  expect(await repo.run(["show", "HEAD:link"])).toBe(path);

  const diff = await repo.git.commitDiff(repo.path, (await repo.run(["rev-parse", "HEAD"])).trim());

  expect(diff.files.find((file) => file.newPath === "link")?.newMode).toBe("120000");
});
