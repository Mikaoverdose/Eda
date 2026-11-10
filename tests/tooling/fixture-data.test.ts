import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("sample and test emails use reserved domains", async () => {
  const roots = ["tests", "src/renderer/devtools", "src/renderer/tutorial", "src/shared/locales"];
  const files = ["scripts/screenshot.ts"];
  for (const root of roots) {
    for (const entry of await readdir(root, { recursive: true })) {
      if (/\.(tsx?|json|md)$/.test(entry)) files.push(join(root, entry));
    }
  }
  const violations: string[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/[\w.%+-]+@([\w.-]+\.[a-z]{2,})/gi)) {
      const host = match[1]!.toLowerCase();
      if (/(^|\.)(example\.(com|net|org)|example|test|invalid)$/.test(host)) continue;
      // These are protocol usernames in SSH/URL parsing cases, not email fixtures.
      if (
        /^(git|-F|-V|secret|token)@(github\.com|gitlab\.com|bitbucket\.org)$/.test(match[0]) &&
        (source.slice(Math.max(0, match.index - 30), match.index).includes("://") ||
          /^(git|-F|-V)@/.test(match[0]))
      )
        continue;
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${file}:${line}: use a reserved example/test/invalid domain`);
    }
  }
  assert.deepEqual(violations, []);
});
