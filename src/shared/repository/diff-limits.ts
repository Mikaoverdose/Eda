import type { FileDiff, UnifiedDiff } from "./repository-read";

export const MAX_DIFF_ROWS = 12_000;
export const MAX_FILE_DIFF_ROWS = 2_000;
export const MAX_DIFF_FILES = 2_000;
export const MAX_DIFF_LINE_CHARS = 20_000;
const MAX_DIFF_CHARS = 1_000_000;
const MAX_FILE_DIFF_CHARS = 128_000;

export function diffStats(file: FileDiff): NonNullable<FileDiff["stats"]> {
  if (file.stats) return file.stats;

  const stats = { lines: 0, additions: 0, deletions: 0, characters: 0, longestLine: 0 };

  for (const hunk of file.hunks)
    for (const line of hunk.lines) {
      stats.lines += Number(line.type !== "no-newline");
      stats.additions += Number(line.type === "addition");
      stats.deletions += Number(line.type === "deletion");
      stats.characters += line.content.length;
      stats.longestLine = Math.max(stats.longestLine, line.content.length);
    }

  return stats;
}

export function boundDiff(diff: UnifiedDiff, maxRows = MAX_DIFF_ROWS): UnifiedDiff {
  const selected = diff.files.slice(0, MAX_DIFF_FILES);
  let remaining = Math.max(0, maxRows - selected.length);
  let characters = MAX_DIFF_CHARS;
  const files = selected.map((file): FileDiff => {
    const stats = diffStats(file);
    let fileRows = Math.min(remaining, MAX_FILE_DIFF_ROWS);
    let fileChars = Math.min(characters, MAX_FILE_DIFF_CHARS);
    let truncated = file.truncated ?? false;
    const hunks = file.hunks.flatMap((hunk) => {
      if (fileRows <= 0 || fileChars <= 0 || file.binary) {
        truncated = true;
        return [];
      }

      remaining -= 1;
      fileRows -= 1;

      const lines = [];

      for (const line of hunk.lines) {
        if (fileRows <= 0 || fileChars <= 0) {
          truncated = true;
          break;
        }

        const content = line.content.slice(0, Math.min(MAX_DIFF_LINE_CHARS, fileChars));

        truncated ||= content.length < line.content.length;
        lines.push({ ...line, content });
        remaining -= 1;
        fileRows -= 1;
        characters -= content.length;
        fileChars -= content.length;
      }

      return [{ ...hunk, lines }];
    });

    return { ...file, stats, hunks, ...(truncated ? { truncated: true } : {}) };
  });

  const omittedFiles = (diff.omittedFiles ?? 0) + diff.files.length - files.length;

  return { files, ...(omittedFiles ? { omittedFiles } : {}) };
}
