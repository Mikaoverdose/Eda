import { errorText, type ErrorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { stateLabel } from "@shared/i18n/labels";
import {
  RECOVERY_PAGE_SIZE,
  type RecoveryEntry,
  type RecoveryInspection,
  type RecoveryPage,
  type RecoverySource,
} from "@shared/workflows/history-recovery";
import { randomUUID } from "node:crypto";

import type { GitService } from "../../git/git-service";
import { assertFullObjectId, assertValidRefName } from "../../git/validation";
import type { WorkflowJournal } from "../../persistence/workflow-journal";
import { PreviewStore } from "../preview-store";
import type { RepositoryManager } from "../lifecycle/repository-manager";
import type { RepositoryWriter } from "../working-tree/repository-writer";

const invalid = (message: ErrorText) =>
  new GitError({ kind: "invalid-input", operation: t("operations.recoverHistory"), message });

export class HistoryRecoveryService {
  private readonly inspections = new PreviewStore<{
    repositoryId: string;
    profileId: string;
    root: string;
    oid: string;
  }>();

  constructor(
    private readonly git: GitService,
    private readonly repositories: RepositoryManager,
    private readonly writer: RepositoryWriter,
    private readonly journal: WorkflowJournal,
  ) {}

  async list(repositoryId: string, source: RecoverySource, offset = 0): Promise<RecoveryPage> {
    const { path, identityId } = this.repositories.resolveActiveRepository(repositoryId);

    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000)
      throw invalid(errorText("main.historyRecoveryService.chooseAValidRecoveryPage"));

    let entries: RecoveryEntry[];

    if (source === "rewrites") {
      entries = this.journal
        .publishedRewrites(identityId, repositoryId, path, offset, RECOVERY_PAGE_SIZE + 1)
        .map((record) => ({
          oid: record.head || record.publishedReversal!.fromHead,
          label: record.message,
          description: t("main.historyRecoveryService.publishedCommitsInTheOriginalActionResult", {
            updatedAt: record.updatedAt,
            value2: record.branch ?? t("main.historyRecoveryService.detachedHead"),
            state: stateLabel(record.state),
            value4: record.refChange?.reversal
              ? ` / ${stateLabel(record.refChange.reversal.state)}`
              : "",
            value5: record.publishedCommits ?? 0,
            value6:
              record.refChange?.afterHead ??
              record.resultHead ??
              t("main.historyRecoveryService.notRecorded"),
            value7: record.publishedReversal
              ? t("main.historyRecoveryService.latestPublishedReversalAtPublishedCommitsTo", {
                  direction: stateLabel(record.publishedReversal.direction),
                  recordedAt: record.publishedReversal.recordedAt,
                  count: record.publishedReversal.count,
                  fromHead: record.publishedReversal.fromHead,
                  value5:
                    record.publishedReversal.toHead ||
                    t("main.historyRecoveryService.unbornBranch"),
                })
              : "",
          }),
        }));
    } else if (source === "reflog") {
      const result = await this.git.exec(
        [
          "log",
          "--walk-reflogs",
          "--exclude=refs/eda/*",
          "--all",
          "--no-patch",
          "--no-decorate",
          "-z",
          `--skip=${offset}`,
          `--max-count=${RECOVERY_PAGE_SIZE + 1}`,
          "--format=%H%x00%gD%x00%gs",
        ],
        { cwd: path, operation: t("operations.browseReflogs"), maxStdoutBytes: 4 * 1024 * 1024 },
      );

      const fields = result.stdout.split("\0");

      entries = [];

      for (let i = 0; i + 2 < fields.length; i += 3) {
        const oid = fields[i]!.trim();
        if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid))
          throw invalid(
            errorText("main.historyRecoveryService.gitReturnedAnUnreadableReflogEntry"),
          );
        entries.push({ oid, label: fields[i + 1]!, description: fields[i + 2]! });
      }
    } else if (source === "saved") {
      const result = await this.git.exec(
        [
          "for-each-ref",
          "--sort=-creatordate",
          "--format=%(objectname)%00%(refname)%00%(objecttype)%00%(subject)",
          "refs/eda/recovery",
          "refs/eda/reference",
        ],
        {
          cwd: path,
          operation: t("operations.browseSavedRecoveryRefs"),
          maxStdoutBytes: 4 * 1024 * 1024,
        },
      );

      entries = result.stdout
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          const [oid, label, type, description] = line.split("\0");
          return type === "commit" && oid && label
            ? [{ oid, label, description: description ?? "" }]
            : [];
        })
        .slice(offset, offset + RECOVERY_PAGE_SIZE + 1);
    } else if (source === "unreachable") {
      const result = await this.git.exec(
        ["fsck", "--unreachable", "--no-reflogs", "--no-progress"],
        {
          cwd: path,
          operation: t("operations.scanUnreachableCommits"),
          maxStdoutBytes: 4 * 1024 * 1024,
        },
      );

      entries = result.stdout
        .split("\n")
        .flatMap((line) => {
          const match = /^unreachable commit ([a-f0-9]{40}|[a-f0-9]{64})$/.exec(line.trim());

          return match
            ? [
                {
                  oid: match[1]!,
                  label: t("main.historyRecoveryService.unreachableCommit"),
                  description: t(
                    "main.historyRecoveryService.inspectToIdentifyThisCommitBeforeRestoring",
                  ),
                },
              ]
            : [];
        })
        .sort((a, b) => a.oid.localeCompare(b.oid))
        .slice(offset, offset + RECOVERY_PAGE_SIZE + 1);
    } else
      throw invalid(
        errorText("main.historyRecoveryService.chooseReflogsSavedRefsSharedHistoryActionsOr"),
      );

    const hasMore = entries.length > RECOVERY_PAGE_SIZE;

    return {
      entries: entries.slice(0, RECOVERY_PAGE_SIZE),
      nextOffset: hasMore ? offset + RECOVERY_PAGE_SIZE : null,
    };
  }

  async inspect(repositoryId: string, oid: string): Promise<RecoveryInspection> {
    assertFullObjectId(oid, t("operations.inspectRecoveryCommit"));

    const repository = this.repositories.resolveActiveRepository(repositoryId);
    const inspection = await this.git.inspectCommit(repository.path, oid);

    if (inspection.commit.oid !== oid)
      throw invalid(
        errorText("main.historyRecoveryService.chooseACommitObjectNotATagOrAnotherObjectType"),
      );

    let diff: RecoveryInspection["diff"] = { files: [] };
    let diffNotice: string | undefined;

    try {
      diff = await this.git.commitDiff(repository.path, oid);
    } catch (error) {
      if (!(error instanceof GitError) || error.kind !== "output-too-large") throw error;
      diffNotice = t("main.historyRecoveryService.theDiffExceedsThePreviewLimitCommitMetadata");
    }

    const token = randomUUID();

    this.inspections.set(token, {
      repositoryId,
      profileId: repository.identityId,
      root: repository.path,
      oid,
    });

    return { token, inspection, diff, ...(diffNotice ? { diffNotice } : {}) };
  }

  restore(repositoryId: string, token: string, name: string): Promise<string> {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    const review = this.inspections.get(token);

    if (
      !review ||
      review.repositoryId !== repositoryId ||
      review.profileId !== repository.identityId ||
      review.root !== repository.path
    )
      throw invalid(
        errorText("main.historyRecoveryService.thisRecoveryInspectionExpiredOrBelongsToAnother"),
      );

    assertValidRefName(name, t("operations.restoreRecoveredBranch"));

    return this.writer.remoteOperation(
      repositoryId,
      t("main.historyRecoveryService.restoreRecoveredBranch"),
      async (root, identity) => {
        await this.git.exec(["check-ref-format", "--branch", name], {
          cwd: root,
          operation: t("operations.validateRecoveredBranchName"),
        });

        const resolved = await this.git.exec(["rev-parse", "--verify", `${review.oid}^{commit}`], {
          cwd: root,
          operation: t("operations.validateRecoveredCommit"),
        });

        if (resolved.stdout.trim() !== review.oid)
          throw invalid(
            errorText("main.historyRecoveryService.theInspectedCommitIsNoLongerAvailable"),
          );

        await this.git.exec(
          [
            "update-ref",
            "--no-deref",
            "--create-reflog",
            "-m",
            "Eda: restore inspected commit",
            "--stdin",
          ],
          {
            cwd: root,
            operation: t("operations.restoreRecoveredBranch"),
            stdin: `create refs/heads/${name} ${review.oid}\n`,
            env: {
              overrides: {
                GIT_COMMITTER_NAME: identity.gitName,
                GIT_COMMITTER_EMAIL: identity.gitEmail,
              },
            },
          },
        );
        this.inspections.delete(token);

        return `refs/heads/${name}`;
      },
    );
  }
}
