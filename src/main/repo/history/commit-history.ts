import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import type { Identity } from "@shared/identity/identity";
import type { CommitResult } from "@shared/repository/repository-write";
import { createHash, randomUUID } from "node:crypto";
import type { GitService } from "../../git/git-service";
import type { WorkflowJournal, WorkflowJournalRecord } from "../../persistence/workflow-journal";
import { repositoryCommonDirectory } from "../lifecycle/repository-location";
import {
  fingerprintContents,
  readWorkflowContents,
  workflowFingerprint,
} from "../workflows/workflow-fingerprint";
import { pruneHistoryRecords } from "./history-retention";
import { isPublishedCommit } from "./shared-history";

export class CommitHistory {
  constructor(
    private readonly git: GitService,
    private readonly journal: WorkflowJournal,
  ) {}

  private async workingState(root: string, workingDiff: Buffer) {
    const untracked = await this.git.exec(["ls-files", "--others", "--exclude-standard", "-z"], {
      cwd: root,
      operation: t("operations.captureCommitUntrackedPaths"),
    });

    return createHash("sha256").update(workingDiff).update(untracked.stdoutBytes).digest("hex");
  }

  async run(
    root: string,
    repositoryId: string,
    identity: Identity,
    amend: boolean,
    commit: () => Promise<string>,
  ): Promise<CommitResult> {
    const before = await this.git.status(root);
    const beforeContents = await readWorkflowContents(this.git, root);
    const fingerprint = fingerprintContents(before, beforeContents);
    const flags = (
      await this.git.exec(["ls-files", "-v", "-z"], {
        cwd: root,
        operation: t("operations.captureCommitIndexFlags"),
      })
    ).stdout;

    const indexTree = (
      await this.git.exec(["write-tree"], {
        cwd: root,
        operation: t("operations.preservePreCommitIndex"),
      })
    ).stdout.trim();
    const working = await this.workingState(root, beforeContents.working);
    const expectedParents =
      amend && before.branch.oid
        ? (
            await this.git.exec(["show", "-s", "--format=%P", before.branch.oid, "--"], {
              cwd: root,
              operation: t("operations.captureAmendmentParents"),
            })
          ).stdout.trim()
        : (before.branch.oid ?? "");

    const workflow = before.workflow ?? this.journal.activeLocal(root);
    const commonDirectory = await repositoryCommonDirectory(this.git, root);

    await pruneHistoryRecords(this.git, this.journal, root, commonDirectory);

    const id = randomUUID();
    const recoveryRef = `refs/eda/recovery/${id}`;
    const record: WorkflowJournalRecord = {
      version: 1,
      id,
      profileId: identity.id,
      repositoryId,
      root,
      identity,
      mode: amend ? "amend" : "commit",
      publishedCommits:
        amend && before.branch.oid && (await isPublishedCommit(this.git, root, before.branch.oid))
          ? 1
          : 0,
      head: before.branch.oid ?? "",
      ...(!before.branch.detached && before.branch.head ? { branch: before.branch.head } : {}),
      incoming: [],
      workflowToken: `${fingerprint}:${flags}`,
      tree: indexTree,
      message: amend ? t("main.commitHistory.amendCommit") : t("main.commitHistory.commit"),
      author: identity.gitName,
      email: identity.gitEmail,
      signing: identity.signing.signCommits,
      state: "prepared",
      updatedAt: new Date().toISOString(),
      refChange: {
        commonDirectory,
        mode: "soft",
        target: "",
        indexTree,
        recoveryRef,
        beforeFingerprint: fingerprint,
        beforeFlags: flags,
        beforeWorking: working,
      },
    };

    this.journal.save(record);
    await this.git.exec(["update-ref", "--stdin"], {
      cwd: root,
      operation: t("operations.preserveCommitRecoveryRefs"),
      stdin: `${
        record.head
          ? `create ${recoveryRef}/head ${record.head}
`
          : ""
      }create ${recoveryRef}/index ${indexTree}
`,
    });
    record.state = "running";
    this.journal.save(record);

    let keepRecord = true;

    try {
      const oid = await commit();

      record.refChange!.target = oid;
      record.refChange!.afterHead = oid;
      this.journal.save(record);

      const after = await this.git.status(root);
      const afterTree = (
        await this.git.exec(["write-tree"], {
          cwd: root,
          operation: t("operations.preserveCommittedIndex"),
        })
      ).stdout.trim();
      const afterFlags = (
        await this.git.exec(["ls-files", "-v", "-z"], {
          cwd: root,
          operation: t("operations.captureCommittedIndexFlags"),
        })
      ).stdout;

      const afterContents = await readWorkflowContents(this.git, root);
      const afterFingerprint = fingerprintContents(after, afterContents);
      const subject = (
        await this.git.exec(["show", "-s", "--format=%s", oid, "--"], {
          cwd: root,
          operation: t("operations.nameReversibleCommit"),
          maxStdoutBytes: 64 * 1024,
        })
      ).stdout.trim();

      const parents = (
        await this.git.exec(["show", "-s", "--format=%P", oid, "--"], {
          cwd: root,
          operation: t("operations.verifyRecordedCommitParents"),
        })
      ).stdout.trim();

      record.message = `${amend ? t("main.commitHistory.amendCommit") : t("main.commitHistory.commit")}: ${subject.slice(0, 200)}`;

      const changed =
        parents !== expectedParents ||
        after.branch.oid !== oid ||
        afterTree !== indexTree ||
        afterFlags !== flags ||
        (await this.workingState(root, afterContents.working)) !== working ||
        after.branch.head !== before.branch.head ||
        after.branch.upstream !== before.branch.upstream;

      const blockedReason = workflow
        ? t("main.commitHistory.thisCommitCompletedAGitWorkflowUseItsOperationSpecificRecovery")
        : changed
          ? t("main.commitHistory.hooksOrAnotherProcessChangedAdditionalRepositoryState")
          : undefined;

      await this.git.exec(["update-ref", "--stdin"], {
        cwd: root,
        operation: t("operations.preserveCommitRedoRefs"),
        stdin: `create ${recoveryRef}/after-head ${oid}
create ${recoveryRef}/after-index ${afterTree}
`,
      });
      record.refChange = {
        ...record.refChange!,
        target: oid,
        afterHead: oid,
        afterFingerprint,
        reversal: {
          state: "applied",
          expectedFingerprint: afterFingerprint,
          afterIndexTree: afterTree,
          beforeFlags: flags,
          afterFlags,
          ...(blockedReason ? { blockedReason } : {}),
        },
      };
      record.state = "completed";

      return { oid, publishedCommits: oid !== record.head ? (record.publishedCommits ?? 0) : 0 };
    } catch (error) {
      record.state = "paused";

      const unchanged = await this.git
        .status(root)
        .then((state) => workflowFingerprint(this.git, root, state))
        .then((value) => value === fingerprint)
        .catch(() => false);

      if (unchanged) {
        try {
          await this.git.exec(["update-ref", "--stdin"], {
            cwd: root,
            operation: t("operations.releaseUnusedCommitRecoveryRefs"),
            stdin: `${
              record.head
                ? `delete ${recoveryRef}/head ${record.head}
`
                : ""
            }delete ${recoveryRef}/index ${indexTree}
`,
          });
          this.journal.remove(record.id);
          keepRecord = false;
        } catch {}
      }

      if (record.refChange?.afterHead) {
        throw new GitError({
          kind: "unknown",
          operation: t("operations.recordCommitRecovery"),
          message: errorText(
            "main.commitHistory.commitWasCreatedButRecordingItsRecoveryStateFailed",
            {
              afterHead: record.refChange.afterHead,
            },
          ),
          suggestedAction: errorText(
            "main.commitHistory.refreshAndInspectHeadBeforeRetryingTheCommit",
          ),
        });
      }

      throw error;
    } finally {
      record.updatedAt = new Date().toISOString();
      if (keepRecord) this.journal.save(record);
    }
  }
}
