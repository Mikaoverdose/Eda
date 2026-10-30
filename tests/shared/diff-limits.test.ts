import { describe, expect, it } from "vitest";
import type { FileDiff } from "@shared/repository/repository-read";
import { boundDiff, MAX_DIFF_FILES, MAX_FILE_DIFF_ROWS } from "@shared/repository/diff-limits";

const file = (name: string, lines: number, content = "text"): FileDiff => ({
  newPath: name,
  status: "added",
  binary: false,
  hunks: [
    {
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: lines,
      heading: "",
      lines: Array.from({ length: lines }, () => ({ type: "addition", content })),
    },
  ],
});

describe("diff payload bounds", () => {
  it("keeps later file summaries and small previews after an oversized file", () => {
    const result = boundDiff({ files: [file("large.txt", 20_000), file("small.txt", 2)] });

    expect(result.files[0]).toMatchObject({
      truncated: true,
      stats: { lines: 20_000, additions: 20_000 },
    });
    expect(result.files[0]?.hunks[0]?.lines).toHaveLength(MAX_FILE_DIFF_ROWS - 1);
    expect(result.files[1]?.hunks[0]?.lines).toHaveLength(2);
    expect(boundDiff(result)).toEqual(result);
  });

  it("bounds total retained characters and keeps summaries when the global row budget runs out", () => {
    const result = boundDiff({
      files: Array.from({ length: 20 }, (_, i) => file(`${i}.txt`, 3_000, "x".repeat(1_000))),
    });

    expect(result.files).toHaveLength(20);

    const text = result.files.flatMap((file) => file.hunks.flatMap((hunk) => hunk.lines));

    expect(text.reduce((sum, line) => sum + line.content.length, 0)).toBeLessThanOrEqual(1_000_000);
    expect(result.files.every((file) => file.truncated && file.stats?.lines === 3_000)).toBe(true);

    const smallBudget = boundDiff({ files: [file("a", 10), file("b", 10)] }, 4);

    expect(smallBudget.files[1]).toMatchObject({ newPath: "b", truncated: true, hunks: [] });
  });

  it("reports omitted files and preserves the count when bounded again", () => {
    const result = boundDiff({
      files: Array.from({ length: MAX_DIFF_FILES + 2 }, (_, i) => file(`${i}`, 0)),
    });
    expect(result.files).toHaveLength(MAX_DIFF_FILES);
    expect(result.omittedFiles).toBe(2);
    expect(boundDiff(result).omittedFiles).toBe(2);
  });
});
