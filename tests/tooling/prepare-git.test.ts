import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { targetFor, verifyArchive } from "../../scripts/prepare-git.ts";

test("each supported package target has a pinned upstream checksum", () => {
  for (const platform of ["win32", "darwin", "linux"])
    for (const arch of ["x64", "arm64"]) {
      const target = targetFor(platform, arch);

      assert.match(
        target.url,
        /^https:\/\/github.com\/desktop\/dugite-native\/releases\/download\//,
      );
      assert.match(target.sha256, /^[0-9a-f]{64}$/);
      assert.equal(target.executable, platform === "win32" ? "cmd/git.exe" : "bin/git");
    }

  assert.throws(() => targetFor("win32", "../../outside"), /does not support/);
});

test("a modified download is rejected before extraction", async () => {
  const root = await mkdtemp(join(tmpdir(), "eda-bundle-test-"));

  try {
    const archive = join(root, "archive");
    const expected = createHash("sha256").update("original archive").digest("hex");
    await writeFile(archive, "original archive");
    await verifyArchive(archive, expected);
    await writeFile(archive, "tampered archive");
    await assert.rejects(verifyArchive(archive, expected), /checksum mismatch/);
  } finally {
    await rm(join(root, "archive"), { force: true });
    await rmdir(root);
  }
});
