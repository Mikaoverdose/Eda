const IGNORED_GIT_ENTRIES = new Set([
  "COMMIT_EDITMSG",
  "FETCH_HEAD",
  "ORIG_HEAD",
  "MERGE_MSG",
  "SQUASH_MSG",
  "TAG_EDITMSG",
]);

export function isIgnoredWatchPath(relativePath: string): boolean {
  const path = relativePath.replaceAll("\\", "/");
  const segments = path.split("/");

  if (segments[0] !== ".git") return false;
  if (path.endsWith(".lock")) return true;

  const entry = segments[1];

  if (entry === undefined) return true;
  if (entry === "objects" || entry === "logs") return true;

  return IGNORED_GIT_ENTRIES.has(entry);
}
