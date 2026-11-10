import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { readCommitTemplate } from "@main/git/commit-template";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "eda-template-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("reads a relative template without changing its text", async () => {
  const template = "Subject\n\n# Commit details\n";
  await writeFile(join(directory, "template"), template);

  expect(await readCommitTemplate(directory, undefined)).toBeNull();
  expect(await readCommitTemplate(directory, "template")).toBe(template);
});

it.skipIf(process.platform === "win32")("allows symlinked templates", async () => {
  await writeFile(join(directory, "template"), "Subject\n");
  await symlink(join(directory, "template"), join(directory, "linked"));

  expect(await readCommitTemplate(directory, "linked")).toBe("Subject\n");
});

it("rejects oversized, non-file, and non-UTF-8 templates", async () => {
  await writeFile(join(directory, "large"), Buffer.alloc(100_001));
  await writeFile(join(directory, "invalid"), Buffer.from([0xff]));

  for (const file of ["large", ".", "invalid"])
    await expect(readCommitTemplate(directory, file)).rejects.toMatchObject({
      kind: "invalid-input",
    });
});
