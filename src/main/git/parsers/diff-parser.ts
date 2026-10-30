import { t } from "@shared/i18n";
import type { DiffHunk, DiffLine, FileDiff, UnifiedDiff } from "@shared/repository/repository-read";
import { boundDiff } from "@shared/repository/diff-limits";

export function parseUnifiedDiff(output: Buffer): UnifiedDiff {
  const text = output.toString("utf8");

  if (text.length === 0) return { files: [] };

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const files: FileDiff[] = [];
  let file: FileDiff | undefined;
  let hunk: DiffHunk | undefined;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      file = { ...parseHeaderPaths(line.slice(11)), status: "modified", binary: false, hunks: [] };
      files.push(file);
      hunk = undefined;
      continue;
    }

    if (!file) continue;

    if (line.startsWith("new file mode ")) {
      file.status = "added";
      delete file.oldPath;
      file.newMode = line.slice(14);
    } else if (line.startsWith("deleted file mode ")) {
      file.status = "deleted";
      delete file.newPath;
      file.oldMode = line.slice(18);
    } else if (line.startsWith("old mode ")) {
      file.oldMode = line.slice(9);
      file.status = "type-changed";
    } else if (line.startsWith("new mode ")) {
      file.newMode = line.slice(9);
    } else if (line.startsWith("rename from ")) {
      file.oldPath = line.slice(12);
      file.status = "renamed";
    } else if (line.startsWith("rename to ")) {
      file.newPath = line.slice(10);
    } else if (line.startsWith("copy from ")) {
      file.oldPath = line.slice(10);
      file.status = "copied";
    } else if (line.startsWith("copy to ")) {
      file.newPath = line.slice(8);
    } else if (line.startsWith("--- ")) {
      const path = parseMarkerPath(line.slice(4));
      if (path !== undefined) file.oldPath = path;
      else delete file.oldPath;
    } else if (line.startsWith("+++ ")) {
      const path = parseMarkerPath(line.slice(4));
      if (path !== undefined) file.newPath = path;
      else delete file.newPath;
    } else if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      file.binary = true;
    } else if (line.startsWith("@@ ")) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);

      if (!match) throw new Error(t("main.git.diffParser.malformedGitUnifiedDiffOutput"));

      oldLine = Number(match[1]);
      newLine = Number(match[3]);
      hunk = {
        oldStart: oldLine,
        oldLines: Number(match[2] ?? 1),
        newStart: newLine,
        newLines: Number(match[4] ?? 1),
        heading: match[5]!.trimStart(),
        lines: [],
      };
      file.hunks.push(hunk);
    } else if (hunk) {
      const parsed = parseHunkLine(line, oldLine, newLine);
      if (!parsed) continue;
      hunk.lines.push(parsed.line);
      oldLine = parsed.oldLine;
      newLine = parsed.newLine;
    }
  }

  return boundDiff({ files });
}

function parseHeaderPaths(value: string): Pick<FileDiff, "oldPath" | "newPath"> {
  // Even the " b/" separator can appear inside an unquoted path.
  if (value.startsWith("a/")) {
    for (let split = value.indexOf(" b/"); split >= 0; split = value.indexOf(" b/", split + 1)) {
      const oldPath = value.slice(2, split);
      const newPath = value.slice(split + 3);
      if (oldPath === newPath) return { oldPath, newPath };
    }
  }

  const pair = /^("(?:\\.|[^"\\])*"|a\/.*?) ("(?:\\.|[^"\\])*"|b\/.*)$/.exec(value);

  if (!pair) return {};

  const oldPath = parseMarkerPath(pair[1]!);
  const newPath = parseMarkerPath(pair[2]!);

  return { ...(oldPath !== undefined && { oldPath }), ...(newPath !== undefined && { newPath }) };
}

function parseMarkerPath(value: string): string | undefined {
  const path = unquotePath(value);
  if (path === "/dev/null") return undefined;
  if (path.startsWith("a/") || path.startsWith("b/")) return path.slice(2);
  return path;
}

function unquotePath(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"')) return value;
  try {
    return JSON.parse(value) as string;
  } catch {
    throw new Error(t("main.git.diffParser.malformedGitUnifiedDiffPath"));
  }
}

function parseHunkLine(
  line: string,
  oldLine: number,
  newLine: number,
): { line: DiffLine; oldLine: number; newLine: number } | undefined {
  if (line.startsWith(" ")) {
    return {
      line: {
        type: "context",
        content: line.slice(1),
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      },
      oldLine: oldLine + 1,
      newLine: newLine + 1,
    };
  }

  if (line.startsWith("-")) {
    return {
      line: { type: "deletion", content: line.slice(1), oldLineNumber: oldLine },
      oldLine: oldLine + 1,
      newLine,
    };
  }

  if (line.startsWith("+")) {
    return {
      line: { type: "addition", content: line.slice(1), newLineNumber: newLine },
      oldLine,
      newLine: newLine + 1,
    };
  }

  if (line === "\\ No newline at end of file") {
    return { line: { type: "no-newline", content: "No newline at end of file" }, oldLine, newLine };
  }

  return undefined;
}
