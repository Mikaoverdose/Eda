// Captured with Git 2.55.0 on Linux using porcelain v2 with branch data and NUL separators.

export const STATUS_PORCELAIN_V2_Z = Buffer.from(
  "# branch.oid 1111111111111111111111111111111111111111\0" +
    "# branch.head main\0" +
    "# branch.upstream origin/main\0" +
    "# branch.ab +2 -1\0" +
    "1 M. N... 100644 100644 100644 1111111111111111111111111111111111111111 2222222222222222222222222222222222222222 tracked.txt\0" +
    "2 R. N... 100644 100644 100644 3333333333333333333333333333333333333333 4444444444444444444444444444444444444444 R100 renamed.txt\0old.txt\0" +
    "? untracked.txt\0",
);

export const LOG_MACHINE_READABLE = [
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb cccccccccccccccccccccccccccccccccccccccc",
  "Eda",
  "dev@example.com",
  "1767225600",
  "1767225601",
  "Merge topic",
  "Details\n",
  "HEAD -> refs/heads/main\x1ftag: refs/tags/v1.0\x1frefs/remotes/origin/main",
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "",
  "Eda",
  "dev@example.com",
  "1767225500",
  "1767225501",
  "Root",
  "",
  "",
  "",
].join("\0");

// Captured with git diff --no-ext-diff --no-textconv --binary --full-index --unified=3.
export const UNIFIED_DIFF = `diff --git a/old.txt b/new.txt
similarity index 88%
rename from old.txt
rename to new.txt
index 1111111..2222222 100644
--- a/old.txt
+++ b/new.txt
@@ -1,2 +1,2 @@ heading
 same
-old
+new
\\ No newline at end of file
diff --git a/image.bin b/image.bin
index 3333333..4444444 100644
Binary files a/image.bin and b/image.bin differ
`;
