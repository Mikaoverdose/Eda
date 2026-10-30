import { GIT_FILE_MODE } from "@shared/repository/git-file-mode";
import { t } from "@shared/i18n";
import { GitError } from "@shared/errors";
import type { PartialStageRequest } from "@shared/repository/partial-stage";

const invalid = (message: string) =>
  new GitError({
    kind: "invalid-input",
    operation: t("operations.preparePartialStaging"),
    message,
  });

interface PatchLine {
  type: string;
  content: string;
  marker: boolean;
  index: number;
}

interface PatchHunk {
  oldStart: number;
  newStart: number;
  lines: PatchLine[];
}

export function partialPatch(
  raw: string,
  path: string,
  selection: Pick<PartialStageRequest, "area" | "hunks" | "lines">,
): { patch: string; additions: number; deletions: number } {
  if (
    /^Binary files |^GIT binary patch|^rename |^copy |^old mode |^new mode |^.*mode (?:120000|160000)$/m.test(
      raw,
    )
  )
    throw invalid(t("main.git.partialPatch.useWholeFileStagingForBinaryRenamedMode"));

  const hunks: PatchHunk[] = [];
  let current: PatchHunk | undefined;
  let files = 0;
  let displayIndex = 0;

  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git ")) files += 1;

    const heading = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);

    if (heading) {
      current = { oldStart: Number(heading[1]), newStart: Number(heading[2]), lines: [] };
      hunks.push(current);
      displayIndex = 0;
    } else if (current && /^[ +\-]/.test(line))
      current.lines.push({
        type: line[0]!,
        content: line.slice(1),
        marker: false,
        index: displayIndex++,
      });
    else if (current && line.startsWith("\\ No newline") && current.lines.length) {
      current.lines.at(-1)!.marker = true;
      displayIndex += 1;
    }
  }

  if (files !== 1 || hunks.length === 0)
    throw invalid(t("main.git.partialPatch.thereIsNoEditableTextPatchForThisFileRefreshItsDiff"));

  const hunkSet = new Set(selection.hunks ?? []);
  const lineSet = new Set((selection.lines ?? []).map((item) => `${item.hunk}:${item.line}`));

  for (const index of hunkSet)
    if (!Number.isInteger(index) || !hunks[index])
      throw invalid(t("main.git.partialPatch.aSelectedHunkNoLongerExists"));

  for (const item of selection.lines ?? [])
    if (
      !Number.isInteger(item.hunk) ||
      !Number.isInteger(item.line) ||
      !["+", "-"].includes(
        hunks[item.hunk]?.lines.find((line) => line.index === item.line)?.type ?? "",
      )
    )
      throw invalid(t("main.git.partialPatch.selectAddedOrDeletedLinesFromTheCurrentDiff"));

  const reverse = selection.area === "staged";
  let all = true;
  let count = 0;
  let additions = 0;
  let deletions = 0;
  let delta = 0;
  const body: string[] = [];

  for (const [hunkIndex, hunk] of hunks.entries()) {
    const lines: PatchLine[] = [];
    let changed = false;

    for (const line of hunk.lines) {
      if (line.type === " ") {
        lines.push(line);
        continue;
      }

      const selected = hunkSet.has(hunkIndex) || lineSet.has(`${hunkIndex}:${line.index}`);

      all &&= selected;

      const type = reverse ? (line.type === "+" ? "-" : "+") : line.type;

      if (selected) {
        lines.push({ ...line, type });
        changed = true;
        count += 1;
        if (type === "+") additions += 1;
        else deletions += 1;
      } else if (type === "-") lines.push({ ...line, type: " " });
    }

    if (!changed) continue;

    const oldCount = lines.filter((line) => line.type !== "+").length;
    const newCount = lines.filter((line) => line.type !== "-").length;
    const oldStart = reverse ? hunk.newStart : hunk.oldStart;
    const newStart =
      newCount === 0
        ? Math.max(0, oldStart + delta - 1)
        : oldCount === 0
          ? oldStart + delta + 1
          : oldStart + delta;

    body.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);

    for (const line of lines) {
      body.push(line.type + line.content);
      if (line.marker) body.push("\\ No newline at end of file");
    }

    delta += newCount - oldCount;
  }

  if (!count) throw invalid(t("main.git.partialPatch.selectAtLeastOneChangedLineOrHunk"));

  const added = /^new file mode /m.test(raw);
  const deleted = /^deleted file mode /m.test(raw);
  const sourceNull = reverse ? deleted : added;
  const targetNull = (reverse ? added : deleted) && all;
  const mode =
    /^(?:new file mode |deleted file mode |index [^\n]+ )(100644|100755)$/m.exec(raw)?.[1] ??
    GIT_FILE_MODE.regular;
  const oldPath = JSON.stringify(`a/${path}`);
  const newPath = JSON.stringify(`b/${path}`);
  const header = [`diff --git ${oldPath} ${newPath}`];

  if (sourceNull) header.push(`new file mode ${mode}`);
  if (targetNull) header.push(`deleted file mode ${mode}`);

  header.push(
    `--- ${sourceNull ? "/dev/null" : oldPath}`,
    `+++ ${targetNull ? "/dev/null" : newPath}`,
  );

  return { patch: [...header, ...body, ""].join("\n"), additions, deletions };
}
