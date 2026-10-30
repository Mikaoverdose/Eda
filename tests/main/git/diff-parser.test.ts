import { describe, expect, it } from "vitest";
import { UNIFIED_DIFF } from "../../fixtures/repository-read-output";
import { parseUnifiedDiff } from "@main/git/parsers/diff-parser";

describe("parseUnifiedDiff", () => {
  it("normalizes renamed text and binary files", () => {
    const diff = parseUnifiedDiff(Buffer.from(UNIFIED_DIFF));

    expect(diff.files).toHaveLength(2);
    expect(diff.files[0]).toMatchObject({
      oldPath: "old.txt",
      newPath: "new.txt",
      status: "renamed",
      binary: false,
    });
    expect(diff.files[0]?.hunks[0]?.lines).toEqual([
      { type: "context", content: "same", oldLineNumber: 1, newLineNumber: 1 },
      { type: "deletion", content: "old", oldLineNumber: 2 },
      { type: "addition", content: "new", newLineNumber: 2 },
      { type: "no-newline", content: "No newline at end of file" },
    ]);
    expect(diff.files[1]).toMatchObject({
      binary: true,
      status: "modified",
      oldPath: "image.bin",
      newPath: "image.bin",
    });
  });

  it("returns an empty model for an empty diff", () => {
    expect(parseUnifiedDiff(Buffer.alloc(0))).toEqual({ files: [] });
  });

  it("retains binary paths with spaces and metadata-only mode changes", () => {
    const diff = parseUnifiedDiff(
      Buffer.from(
        "diff --git a/a b/file.bin b/a b/file.bin\nBinary files a/a b/file.bin and b/a b/file.bin differ\ndiff --git a/script.sh b/script.sh\nold mode 100644\nnew mode 100755\n",
      ),
    );

    expect(diff.files[0]).toMatchObject({ newPath: "a b/file.bin", binary: true });
    expect(diff.files[1]).toMatchObject({
      newPath: "script.sh",
      oldMode: "100644",
      newMode: "100755",
    });
  });

  it("decodes Git-quoted marker paths", () => {
    const output =
      'diff --git "a/a file.txt" "b/a file.txt"\n--- "a/a file.txt"\n+++ "b/a file.txt"\n@@ -1 +1 @@\n-old\n+new\n';
    expect(parseUnifiedDiff(Buffer.from(output)).files[0]).toMatchObject({
      oldPath: "a file.txt",
      newPath: "a file.txt",
    });
  });
});
