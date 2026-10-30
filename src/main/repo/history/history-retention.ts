import { t } from "@shared/i18n";
import { GitError } from "@shared/errors";
import type { GitService } from "../../git/git-service";
import type { WorkflowJournal, WorkflowJournalRecord } from "../../persistence/workflow-journal";

const invalid = (message: string) =>
  new GitError({
    kind: "invalid-input",
    operation: t("operations.retainHistoryRecovery"),
    message,
  });

export async function pruneHistoryRecords(
  git: GitService,
  journal: WorkflowJournal,
  root: string,
  commonDirectory: string,
) {
  const records = journal.historyActions(root, commonDirectory);
  const completed = (record: WorkflowJournalRecord) =>
    record.state === "completed" &&
    !["undoing", "redoing"].includes(record.refChange?.reversal?.state ?? "");

  if (records.filter((record) => !completed(record)).length >= 100)
    throw invalid(t("main.historyRetention.thereAreTooManyUnfinishedHistoryRecordsInspect"));

  const complete = records.filter(completed);

  for (const [index, record] of complete.entries()) {
    if (!Number.isFinite(Date.parse(record.updatedAt))) continue;
    if (index < 99 && Date.parse(record.updatedAt) >= Date.now() - 30 * 86400_000) continue;

    if (
      !/^[a-f0-9-]{36}$/.test(record.id) ||
      record.refChange!.recoveryRef !== `refs/eda/recovery/${record.id}`
    )
      continue;

    if (
      ![
        ...(record.head ? [record.head] : []),
        record.refChange!.indexTree,
        ...(record.refChange!.reversal
          ? [record.refChange!.target, record.refChange!.reversal.afterIndexTree]
          : []),
      ].every((oid) => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid))
    )
      continue;

    const deletes: string[] = [];
    let changed = false;

    for (const [suffix, oid] of [
      ...(record.head ? [["head", record.head]] : []),
      ["index", record.refChange!.indexTree],
      ...(record.refChange!.reversal
        ? [
            ["after-head", record.refChange!.target],
            ["after-index", record.refChange!.reversal.afterIndexTree],
          ]
        : []),
    ]) {
      const ref = `${record.refChange!.recoveryRef}/${suffix}`;
      const current = await git.exec(["rev-parse", "--verify", "--quiet", ref], {
        cwd: root,
        operation: t("operations.inspectExpiredHistoryRecovery"),
        allowedExitCodes: [0, 1],
      });

      if (current.exitCode === 1) continue;

      if (current.stdout.trim() !== oid) {
        changed = true;
        break;
      }

      deletes.push(`delete ${ref} ${oid}`);
    }

    if (changed) continue;

    if (deletes.length)
      await git.exec(["update-ref", "--stdin"], {
        cwd: root,
        operation: t("operations.pruneExpiredHistoryRecovery"),
        stdin: `${deletes.join("\n")}\n`,
      });

    journal.remove(record.id);
  }
}
