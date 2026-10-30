import type {
  HistoryDirection,
  BranchCheckoutPhase,
  HistoryReversal,
  HistoryReversalKind,
} from "@shared/workflows/history-recovery";
import { stateLabel } from "@shared/i18n/labels";
import { t } from "@shared/i18n";
import { GitError } from "@shared/errors";

import { createHash } from "node:crypto";
import type { GitService } from "../../git/git-service";
import type {
  ContentRecoveryRepository,
  ContentRecoveryRecord,
} from "../../persistence/content-recovery-repository";
import type { WorkflowJournal, WorkflowJournalRecord } from "../../persistence/workflow-journal";
import type { RepositoryManager } from "../lifecycle/repository-manager";
import type { RepositoryWriter } from "../working-tree/repository-writer";
import type { WorkflowService } from "../workflows/workflow-service";
import { DiscardService } from "../working-tree/discard-service";
import { workflowFingerprint } from "../workflows/workflow-fingerprint";
import { repositoryCommonDirectory } from "../lifecycle/repository-location";
import { withLockedIndex } from "../../git/operations/locked-index";
import { publishedRangeCount } from "./shared-history";
import {
  executeRefHistory,
  validateRefHistory,
  pendingRefConfiguration,
  finishRefConfiguration,
  completedRefIntent,
  validateUnstartedRefIntent,
  validatePendingBranchCheckout,
  finishBranchCheckout,
  pendingBranchReversal,
  finishBranchReversal,
  releaseReferenceObjects,
} from "./ref-history";
import { ensureRecoveryRefs } from "./rewrite-history";
import { protectResetPaths } from "../workflows/reset-service";

const invalid = (message: string) =>
  new GitError({ kind: "invalid-input", operation: t("operations.reverseLocalAction"), message });

export class HistoryReversalService {
  private readonly recovery: DiscardService;

  constructor(
    private readonly git: GitService,
    private readonly repositories: RepositoryManager,
    private readonly writer: RepositoryWriter,
    private readonly workflows: WorkflowService,
    private readonly journal: WorkflowJournal,
    private readonly content: ContentRecoveryRepository,
  ) {
    this.recovery = new DiscardService(git, content);
  }

  private records(repositoryId: string) {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    const records = [
      ...this.journal.historyActions(repository.path),
      ...this.journal.refActions(repository.path),
    ]
      .filter(
        (record) =>
          record.profileId === repository.identityId && record.repositoryId === repositoryId,
      )
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

    const stateOf = (record: WorkflowJournalRecord) =>
      record.refOperation?.state ?? record.refChange?.reversal?.state;
    const unfinished = (record: WorkflowJournalRecord) =>
      record.state !== "completed" || ["undoing", "redoing"].includes(stateOf(record) ?? "");

    return {
      repository,
      records: [
        ...records.filter(unfinished),
        ...records.filter((record) => !unfinished(record)).slice(0, 20),
      ],
    };
  }

  private async validate(
    record: WorkflowJournalRecord,
    options: { reconciling?: boolean; partialIndex?: boolean } = {},
  ) {
    if (record.refOperation)
      throw invalid(
        t("main.historyReversalService.thisIsABranchOrCheckoutActionInspectItsReferenceStateFirst"),
      );

    const reset = record.refChange;

    if (!reset)
      throw invalid(t("main.historyReversalService.thisActionHasNoCompletedReversalRecordInspect"));

    const reversal = reset.reversal;

    if (record.state !== "completed" || !reversal)
      throw invalid(t("main.historyReversalService.thisActionHasNoCompletedReversalRecordInspect"));

    if (reversal.state === "undoing" || reversal.state === "redoing")
      throw invalid(t("main.historyReversalService.aReversalWasInterruptedInspectHeadIndexAnd"));

    if (reversal.blockedReason) throw invalid(reversal.blockedReason);

    if (
      !options.reconciling &&
      this.journal
        .historyActions(record.root)
        .some(
          (item) =>
            item.id !== record.id &&
            ["undoing", "redoing"].includes(item.refChange?.reversal?.state ?? ""),
        )
    )
      throw invalid(
        t("main.historyReversalService.anotherLocalActionReversalWasInterruptedInspectRecovery"),
      );

    if ((await repositoryCommonDirectory(this.git, record.root)) !== reset.commonDirectory)
      throw invalid(t("main.historyReversalService.thePhysicalRepositoryChanged"));

    const status = await this.git.status(record.root);

    if (await this.workflows.observe(record.root, status))
      throw invalid(t("main.historyReversalService.finishOrAbortTheCurrentGitOperationFirst"));

    const undo = reversal.state === "applied";
    const expectedHead = undo ? reset.target : record.head;

    if (
      (status.branch.oid ?? "") !== expectedHead ||
      (status.branch.detached ? undefined : status.branch.head) !== record.branch
    )
      throw invalid(
        t("main.historyReversalService.headOrTheCheckedOutBranchChangedSinceThisAction"),
      );

    if (
      !options.partialIndex &&
      (await workflowFingerprint(this.git, record.root, status)) !== reversal.expectedFingerprint
    )
      throw invalid(t("main.historyReversalService.theRepositoryChangedSinceThisActionUndoRedo"));

    const flags = (
      await this.git.exec(["ls-files", "-v", "-z"], {
        cwd: record.root,
        operation: t("operations.validateReversalIndexFlags"),
      })
    ).stdout;

    if (!options.partialIndex && flags !== (undo ? reversal.afterFlags : reversal.beforeFlags))
      throw invalid(t("main.historyReversalService.indexFlagsChangedSinceThisAction"));

    const refs = (
      await this.git.exec(
        ["for-each-ref", "--format=%(refname)%00%(objectname)", reset.recoveryRef],
        { cwd: record.root, operation: t("operations.validateReversalRecoveryRefs") },
      )
    ).stdout;

    const objects = new Map(
      refs
        .trim()
        .split("\n")
        .map((line) => line.split("\0") as [string, string]),
    );

    const expectedRefs: [string, string][] = [
      ...(record.head ? [["head", record.head] as [string, string]] : []),
      ["index", reset.indexTree],
      ["after-head", reset.target],
      ["after-index", reversal.afterIndexTree],
    ];

    for (const [suffix, oid] of expectedRefs)
      if (objects.get(`${reset.recoveryRef}/${suffix}`) !== oid)
        throw invalid(t("main.historyReversalService.aRequiredRecoveryRefIsMissingOrChanged"));

    if (record.branch) {
      const worktrees = await this.git.exec(["worktree", "list", "--porcelain"], {
        cwd: record.root,
        operation: t("operations.validateReversalWorktrees"),
      });

      if (
        worktrees.stdout.split("\n").filter((line) => line === `branch refs/heads/${record.branch}`)
          .length > 1
      )
        throw invalid(t("main.historyReversalService.thisBranchIsCheckedOutInMultipleWorktrees"));

      const symbolic = await this.git.exec(
        ["symbolic-ref", "--quiet", `refs/heads/${record.branch}`],
        {
          cwd: record.root,
          operation: t("operations.validateReversalBranch"),
          allowedExitCodes: [0, 1],
        },
      );

      if (symbolic.exitCode === 0)
        throw invalid(
          t("main.historyReversalService.symbolicBranchRefsCannotBeReversedAutomatically"),
        );
    }

    let snapshot: ContentRecoveryRecord | undefined;

    if (reset.mode === "hard" && reset.snapshotId && !options.partialIndex) {
      if (
        this.content.get(record.profileId, record.repositoryId, reset.snapshotId)?.state !==
        "completed"
      )
        throw invalid(
          t("main.historyReversalService.theOriginalWorkingContentSnapshotIsMissingInspect"),
        );

      const id = undo ? reset.snapshotId : reversal.redoSnapshotId;

      snapshot = id ? this.content.get(record.profileId, record.repositoryId, id) : undefined;

      if (
        !snapshot ||
        snapshot.root !== record.root ||
        snapshot.state !== "completed" ||
        !snapshot.after
      )
        throw invalid(t("main.historyReversalService.aRequiredWorkingContentSnapshotIsMissingOr"));

      await this.recovery.validateOperationFiles(snapshot, snapshot.after);
    }

    return { undo, expectedHead, expectedRefs, snapshot };
  }

  private async workingHash(root: string) {
    const working = await this.git.exec(
      ["diff", "--binary", "--no-ext-diff", "--no-textconv", "--"],
      { cwd: root, operation: t("operations.reviewInterruptedResetWorkingFiles") },
    );
    return createHash("sha256").update(working.stdoutBytes).digest("hex");
  }

  private async indexFlags(root: string) {
    return (
      await this.git.exec(["ls-files", "-v", "-z"], {
        cwd: root,
        operation: t("operations.reviewInterruptedResetIndexFlags"),
      })
    ).stdout;
  }

  private async indexTree(root: string) {
    return (
      await this.git.exec(["write-tree"], {
        cwd: root,
        operation: t("operations.reviewInterruptedResetIndex"),
      })
    ).stdout.trim();
  }

  private async commitTree(root: string, oid: string) {
    return (
      await this.git.exec(["rev-parse", `${oid}^{tree}`], {
        cwd: root,
        operation: t("operations.reviewInterruptedResetTarget"),
      })
    ).stdout.trim();
  }

  private specialFlags(flags: string) {
    return flags.split("\0").some((line) => line && !line.startsWith("H "));
  }

  private async inspectInterruptedReset(
    record: WorkflowJournalRecord,
  ): Promise<"execute" | "record"> {
    const reset = record.refChange;

    if (record.mode !== "reset" || !reset || reset.reversal)
      throw invalid(t("main.historyReversalService.thisRecordIsNotAnInterruptedOriginalReset"));
    if (record.state === "completed")
      throw invalid(t("main.historyReversalService.thisResetAlreadyHasACompletedRecoveryRecord"));
    if ((await repositoryCommonDirectory(this.git, record.root)) !== reset.commonDirectory)
      throw invalid(t("main.historyReversalService.thePhysicalRepositoryChanged"));

    const status = await this.git.status(record.root);

    if (await this.workflows.observe(record.root, status))
      throw invalid(t("main.historyReversalService.finishOrAbortTheCurrentGitOperationFirst"));
    if ((status.branch.detached ? undefined : status.branch.head) !== record.branch)
      throw invalid(t("main.historyReversalService.theCheckedOutBranchChangedSinceThisReset"));

    const head = status.branch.oid ?? "";
    const tree = await this.indexTree(record.root);
    const flags = await this.indexFlags(record.root);
    const working = await this.workingHash(record.root);
    const startMatches =
      tree === reset.indexTree &&
      reset.beforeFlags !== undefined &&
      flags === reset.beforeFlags &&
      !!reset.beforeWorking &&
      working === reset.beforeWorking;

    const requireSavedStart = async () => {
      if (reset.mode !== "hard" || !reset.snapshotId) return;

      const snapshot = this.content.get(record.profileId, record.repositoryId, reset.snapshotId);

      if (
        !snapshot ||
        snapshot.root !== record.root ||
        !["prepared", "completed"].includes(snapshot.state)
      )
        throw invalid(
          t("main.historyReversalService.theOriginalWorkingContentSnapshotIsUnavailablePreserve"),
        );

      await this.recovery.validateOperationFiles(
        snapshot,
        Object.fromEntries(snapshot.files.map((file) => [file.path, file.hash])),
      );
    };

    if (reset.mode === "hard") {
      const affected = await this.git.exec(
        ["diff", "--cached", "--name-only", "-z", "--no-renames", reset.target, "--"],
        { cwd: record.root, operation: t("operations.reviewResumedResetPaths") },
      );

      await protectResetPaths(
        this.git,
        record.root,
        reset.target,
        affected.stdout.split("\0").filter(Boolean),
      );
    }

    if (head === record.head && head !== reset.target) {
      if (tree !== reset.indexTree)
        throw invalid(
          t(
            "main.historyReversalService.theIndexChangedSinceThisResetInspectStagedChangesBeforeResuming",
          ),
        );

      if (reset.beforeFlags === undefined || flags !== reset.beforeFlags)
        throw invalid(t("main.historyReversalService.theIndexFlagsChangedSinceThisReset"));

      if (!reset.beforeWorking || working !== reset.beforeWorking)
        throw invalid(t("main.historyReversalService.workingFilesChangedSinceThisResetResumeIs"));

      await requireSavedStart();

      return "execute";
    }

    if (head !== reset.target)
      throw invalid(t("main.historyReversalService.headIsNeitherThisResetSStarting"));

    const expectedIndex =
      reset.mode === "soft" ? reset.indexTree : await this.commitTree(record.root, reset.target);
    const resultMatches =
      tree === expectedIndex &&
      (reset.mode !== "soft" || (reset.beforeFlags !== undefined && flags === reset.beforeFlags)) &&
      (reset.mode === "hard"
        ? working === createHash("sha256").update(Buffer.alloc(0)).digest("hex")
        : reset.mode === "soft"
          ? !!reset.beforeWorking && working === reset.beforeWorking
          : true);

    if (resultMatches) return "record";

    if (startMatches) {
      await requireSavedStart();
      return "execute";
    }

    throw invalid(
      reset.mode === "soft"
        ? t("main.historyReversalService.theIndexOrWorkingFilesDoNotMatchMessage")
        : t("main.historyReversalService.theIndexOrWorkingFilesDoNotMatch"),
    );
  }

  private async finalizeInterruptedReset(record: WorkflowJournalRecord) {
    const reset = record.refChange!;
    const afterIndexTree = await this.indexTree(record.root);
    const afterFlags = await this.indexFlags(record.root);
    const afterFingerprint = await workflowFingerprint(
      this.git,
      record.root,
      await this.git.status(record.root),
    );

    await ensureRecoveryRefs(this.git, record.root, reset.recoveryRef, [
      ["head", record.head],
      ["index", reset.indexTree],
      ["after-head", reset.target],
      ["after-index", afterIndexTree],
    ]);

    let blockedReason: string | undefined;

    if (reset.beforeFlags === undefined)
      blockedReason = t("main.historyReversalService.theOriginalResetDidNotRecordIndexFlags");
    else if (
      reset.mode !== "soft" &&
      (this.specialFlags(reset.beforeFlags) || this.specialFlags(afterFlags))
    )
      blockedReason = t("main.historyReversalService.theOriginalOrResultingIndexHasSpecialFlags");

    if (reset.snapshotId) {
      const snapshot = this.content.get(record.profileId, record.repositoryId, reset.snapshotId);

      if (!snapshot || snapshot.root !== record.root) {
        delete reset.snapshotId;
        blockedReason ??= t(
          "main.historyReversalService.theOriginalWorkingContentSnapshotIsMissingUse",
        );
      } else if (snapshot.state === "prepared" || snapshot.state === "completed") {
        await this.recovery.finishOperation(snapshot);
      } else {
        blockedReason ??= t(
          "main.historyReversalService.theOriginalContentSnapshotWasAlreadyRestoredInspect",
        );
      }
    }

    reset.afterHead = reset.target;
    reset.afterFingerprint = afterFingerprint;
    reset.reversal = {
      state: "applied",
      expectedFingerprint: afterFingerprint,
      afterIndexTree,
      beforeFlags: reset.beforeFlags ?? "",
      afterFlags,
      ...(blockedReason ? { blockedReason } : {}),
    };
    record.state = "completed";
    record.updatedAt = new Date().toISOString();
    this.journal.save(record);
  }

  resumeReset(repositoryId: string, id: string, expectedPublishedCommits?: number) {
    const { records } = this.records(repositoryId);

    if (!records.some((record) => record.id === id))
      throw invalid(t("main.historyReversalService.thisActionBelongsToAnotherContext"));

    return this.writer.remoteOperation(
      repositoryId,
      t("main.historyReversalService.resumeInterruptedReset"),
      async (root, identity) => {
        const current = this.journal.historyActions(root).find((record) => record.id === id);

        if (!current || current.profileId !== identity.id || current.repositoryId !== repositoryId)
          throw invalid(t("main.historyReversalService.thisActionBelongsToAnotherContext"));

        const inspection = await this.inspectInterruptedReset(current);
        const publishedCommits = Math.max(
          current.publishedCommits ?? 0,
          await publishedRangeCount(this.git, root, current.head, current.refChange!.target),
        );

        if (expectedPublishedCommits !== undefined && publishedCommits !== expectedPublishedCommits)
          throw invalid(
            t("main.historyReversalService.remoteTrackingHistoryChangedAfterReviewRefreshUndo"),
          );

        current.publishedCommits = publishedCommits;
        this.journal.save(current);

        let outcome: "reset" | "recorded" = "recorded";

        if (inspection === "execute") {
          const reset = current.refChange!;
          const afterTree =
            reset.mode === "soft"
              ? reset.indexTree
              : await this.commitTree(current.root, reset.target);

          await ensureRecoveryRefs(this.git, current.root, reset.recoveryRef, [
            ["head", current.head],
            ["index", reset.indexTree],
            ["after-head", reset.target],
            ["after-index", afterTree],
          ]);
          await this.git.exec(
            [
              "-c",
              "submodule.recurse=false",
              "reset",
              `--${reset.mode}`,
              "--no-recurse-submodules",
              reset.target,
            ],
            { cwd: root, operation: t("operations.resumeReset", { mode: reset.mode }) },
          );
          outcome = "reset";

          if ((await this.inspectInterruptedReset(current)) !== "record")
            throw invalid(t("main.historyReversalService.theResumedResetDidNotReachItsRecorded"));
        }

        await this.finalizeInterruptedReset(current);

        return { outcome };
      },
    );
  }

  private async reconciledRecord(record: WorkflowJournalRecord): Promise<WorkflowJournalRecord> {
    if (record.refOperation) {
      if (record.state !== "completed") return completedRefIntent(this.git, record);

      const operation = record.refOperation;

      if (!["undoing", "redoing"].includes(operation.state))
        throw invalid(
          t("main.historyReversalService.thisActionHasNoInterruptedReversalToReconcile"),
        );

      const states =
        operation.state === "undoing"
          ? (["undone", "applied"] as const)
          : (["applied", "undone"] as const);

      for (const state of states) {
        const candidate = structuredClone(record);

        candidate.refOperation!.state = state;

        try {
          const direction = await validateRefHistory(this.git, candidate);
          if (direction === (state === "undone" ? "redo" : "undo")) return candidate;
        } catch {}
      }

      throw invalid(
        t("main.historyReversalService.theInterruptedReferenceReversalIsPartialOrExternally"),
      );
    }

    const reversal = record.refChange?.reversal;

    if (!reversal || !["undoing", "redoing"].includes(reversal.state))
      throw invalid(t("main.historyReversalService.thisActionHasNoInterruptedReversalToReconcile"));

    const states =
      reversal.state === "undoing"
        ? (["undone", "applied"] as const)
        : (["applied", "undone"] as const);

    for (const state of states) {
      const candidate = structuredClone(record);

      candidate.refChange!.reversal!.state = state;
      candidate.refChange!.reversal!.expectedFingerprint =
        state === "undone"
          ? this.beforeFingerprint(candidate)
          : record.refChange!.afterFingerprint!;

      try {
        await this.validate(candidate, { reconciling: true });
        return candidate;
      } catch {}
    }

    throw invalid(
      t("main.historyReversalService.theInterruptedReversalIsPartialExternallyChangedOr"),
    );
  }

  private beforeFingerprint(record: WorkflowJournalRecord) {
    const reset = record.refChange;

    if (!reset)
      throw invalid(t("main.historyReversalService.thisActionHasNoResetStyleRecoveryRecord"));

    const recorded = reset.beforeFingerprint;

    if (!recorded)
      throw invalid(
        t("main.historyReversalService.theOriginalRepositoryFingerprintWasNotRecordedUse"),
      );

    return recorded;
  }

  resumeBranchCheckout(repositoryId: string, id: string, phase: BranchCheckoutPhase = "original") {
    const { records } = this.records(repositoryId);

    if (!records.some((record) => record.id === id))
      throw invalid(t("main.historyReversalService.thisActionBelongsToAnotherContext"));

    return this.writer.remoteOperation(
      repositoryId,
      t("main.historyReversalService.resumeBranchCheckout"),
      async (root, identity) => {
        const current = this.findRecord(root, id);

        if (!current || current.profileId !== identity.id || current.repositoryId !== repositoryId)
          throw invalid(t("main.historyReversalService.thisActionBelongsToAnotherContext"));
        if (await this.workflows.observe(root, await this.git.status(root)))
          throw invalid(t("main.historyReversalService.finishOrAbortTheCurrentGitOperationFirst"));

        const candidate =
          phase === "original"
            ? await finishBranchCheckout(this.git, current)
            : await finishBranchReversal(this.git, current, phase);

        candidate.updatedAt = new Date().toISOString();
        this.journal.save(candidate);
      },
    );
  }

  dismissUnstarted(repositoryId: string, id: string) {
    const { records } = this.records(repositoryId);

    if (!records.some((record) => record.id === id))
      throw invalid(t("main.historyReversalService.thisActionBelongsToAnotherContext"));

    return this.writer.remoteOperation(
      repositoryId,
      t("main.historyReversalService.dismissUnstartedAction"),
      async (root, identity) => {
        const current = this.findRecord(root, id);

        if (!current || current.profileId !== identity.id || current.repositoryId !== repositoryId)
          throw invalid(t("main.historyReversalService.thisActionBelongsToAnotherContext"));
        if (await this.workflows.observe(root, await this.git.status(root)))
          throw invalid(t("main.historyReversalService.finishOrAbortTheCurrentGitOperationFirst"));

        await validateUnstartedRefIntent(this.git, current);
        await releaseReferenceObjects(this.git, current);
        this.journal.remove(current.id);
      },
    );
  }

  reconcile(repositoryId: string, id: string, expectedState: "applied" | "undone") {
    const { records } = this.records(repositoryId);

    if (!records.some((record) => record.id === id))
      throw invalid(t("main.historyReversalService.thisActionBelongsToAnotherContext"));

    return this.writer.remoteOperation(
      repositoryId,
      t("main.historyReversalService.reconcileInterruptedReversal"),
      async (root, identity) => {
        const current = this.findRecord(root, id);

        if (!current || current.profileId !== identity.id || current.repositoryId !== repositoryId)
          throw invalid(t("main.historyReversalService.thisActionBelongsToAnotherContext"));

        const candidate = await this.reconciledRecord(current);
        const state = candidate.refOperation?.state ?? candidate.refChange?.reversal?.state;

        if (state !== expectedState)
          throw invalid(
            t("main.historyReversalService.theRecoveryStateChangedAfterReviewRefreshUndoRedo"),
          );

        candidate.updatedAt = new Date().toISOString();
        this.journal.save(candidate);
      },
    );
  }

  private async pendingIndex(record: WorkflowJournalRecord) {
    const reset = record.refChange;
    const reversal = reset?.reversal;

    if (
      !reset ||
      !["mixed", "hard"].includes(reset.mode) ||
      !reversal ||
      !["undoing", "redoing"].includes(reversal.state)
    )
      throw invalid(
        t(
          "main.historyReversalService.onlyAnInterruptedMixedOrHardResetReversalCanResumeRestoration",
        ),
      );

    const undo = reversal.state === "undoing";
    const candidate = structuredClone(record);
    const next = candidate.refChange!.reversal!;

    next.state = undo ? "undone" : "applied";
    next.expectedFingerprint = undo ? this.beforeFingerprint(record) : reset.afterFingerprint!;
    await this.validate(candidate, { partialIndex: true });

    let files:
      | {
          target: ContentRecoveryRecord;
          source: Record<string, string>;
          redo: ContentRecoveryRecord;
        }
      | undefined;

    if (reset.mode === "hard" && reset.snapshotId) {
      const original = this.content.get(record.profileId, record.repositoryId, reset.snapshotId);
      const redo = reversal.redoSnapshotId
        ? this.content.get(record.profileId, record.repositoryId, reversal.redoSnapshotId)
        : undefined;

      if (
        !original ||
        !redo ||
        original.root !== record.root ||
        redo.root !== record.root ||
        original.state !== "completed" ||
        !original.after ||
        !(redo.state === "completed" || (undo && redo.state === "prepared")) ||
        original.files.length !== redo.files.length ||
        original.files.some(
          (file) =>
            !redo.files.some(
              (saved) => saved.path === file.path && saved.hash === original.after![file.path],
            ),
        )
      )
        throw invalid(
          t("main.historyReversalService.requiredWorkingContentSnapshotsAreMissingOrChanged"),
        );

      const target = undo ? original : redo;
      const source = Object.fromEntries(
        (undo ? redo : original).files.map((file) => [file.path, file.hash]),
      );

      await this.recovery.validateOperationFiles(target, source, true);
      files = { target, source, redo };
    }

    const flags = (
      await this.git.exec(["ls-files", "-v", "-z"], {
        cwd: record.root,
        operation: t("operations.reviewInterruptedIndexFlags"),
      })
    ).stdout;

    const targetTree = undo ? reset.indexTree : reversal.afterIndexTree;
    const sourceTree = undo ? reversal.afterIndexTree : reset.indexTree;
    const targetFlags = undo ? reversal.beforeFlags : reversal.afterFlags;
    const sourceFlags = undo ? reversal.afterFlags : reversal.beforeFlags;

    for (const [tree, expectedFlags] of [
      [targetTree, targetFlags],
      [sourceTree, sourceFlags],
    ]) {
      if (flags !== expectedFlags) continue;

      const match = await this.git.exec(
        [
          "diff",
          "--cached",
          "--quiet",
          "--no-ext-diff",
          "--no-textconv",
          "--ita-visible-in-index",
          tree!,
          "--",
        ],
        {
          cwd: record.root,
          operation: t("operations.reviewInterruptedIndexContents"),
          allowedExitCodes: [0, 1],
        },
      );

      if (match.exitCode === 0)
        return { candidate, targetTree, targetFlags, atTarget: tree === targetTree, files };
    }

    throw invalid(t("main.historyReversalService.theIndexHasNewerStagedChangesOrFlags"));
  }

  resumeIndex(repositoryId: string, id: string, expectedDirection?: HistoryDirection) {
    const { records } = this.records(repositoryId);

    if (!records.some((record) => record.id === id))
      throw invalid(t("main.historyReversalService.thisActionBelongsToAnotherContext"));

    return this.writer.remoteOperation(
      repositoryId,
      t("main.historyReversalService.resumeInterruptedRestoration"),
      async (root, identity) =>
        withLockedIndex(this.git, root, async (lockedIndex) => {
          const current = this.journal.historyActions(root).find((record) => record.id === id);

          if (
            !current ||
            current.profileId !== identity.id ||
            current.repositoryId !== repositoryId
          )
            throw invalid(t("main.historyReversalService.thisActionBelongsToAnotherContext"));

          const { candidate, targetTree, targetFlags, atTarget, files } =
            await this.pendingIndex(current);

          if (expectedDirection && current.refChange!.reversal!.state !== `${expectedDirection}ing`)
            throw invalid(
              t(
                "main.historyReversalService.theInterruptedReversalChangedAfterReviewRefreshUndoRedo",
              ),
            );
          if (!atTarget)
            await lockedIndex.prepare(targetTree, t("operations.resumeInterruptedReversalIndex"));

          await this.pendingIndex(current);

          if (files) await this.recovery.restoreOperationFiles(files.target, files.source);
          if (!atTarget) await lockedIndex.publish();
          if (files && current.refChange!.reversal!.state === "undoing")
            await this.recovery.finishOperation(files.redo);

          const status = await this.git.status(root);
          const expectedHead =
            candidate.refChange!.reversal!.state === "undone"
              ? candidate.head
              : candidate.refChange!.target;

          if (
            (status.branch.oid ?? "") !== expectedHead ||
            (status.branch.detached ? undefined : status.branch.head) !== candidate.branch
          )
            throw invalid(
              t("main.historyReversalService.headChangedDuringIndexRecoveryTheInterrupted"),
            );

          const fingerprint = await workflowFingerprint(this.git, root, status);
          const flags = (
            await this.git.exec(["ls-files", "-v", "-z"], {
              cwd: root,
              operation: t("operations.verifyResumedIndexFlags"),
            })
          ).stdout;

          const reversal = candidate.refChange!.reversal!;
          const index = await this.git.exec(
            [
              "diff",
              "--cached",
              "--quiet",
              "--no-ext-diff",
              "--no-textconv",
              "--ita-visible-in-index",
              targetTree,
              "--",
            ],
            {
              cwd: root,
              operation: t("operations.verifyResumedIndexContents"),
              allowedExitCodes: [0, 1],
            },
          );

          if (flags !== targetFlags || index.exitCode !== 0)
            throw invalid(
              t("main.historyReversalService.theIndexChangedDuringRecoveryTheInterruptedRecord"),
            );

          const preservedNewerWork = fingerprint !== reversal.expectedFingerprint;

          if (preservedNewerWork)
            reversal.blockedReason = t(
              "main.historyReversalService.recoveryFinishedWithNewerRepositoryStateRetainedInspect",
            );

          candidate.updatedAt = new Date().toISOString();
          this.journal.save(candidate);

          return { preservedNewerWork };
        }),
    );
  }

  resumeConfiguration(repositoryId: string, id: string, direction: HistoryDirection) {
    const { records } = this.records(repositoryId);

    if (!records.some((record) => record.id === id))
      throw invalid(t("main.historyReversalService.thisActionBelongsToAnotherContext"));

    return this.writer.remoteOperation(
      repositoryId,
      t("main.historyReversalService.finishBranchConfigurationRecovery"),
      async (root, identity) =>
        withLockedIndex(this.git, root, async () => {
          const current = this.findRecord(root, id);

          if (
            !current ||
            current.profileId !== identity.id ||
            current.repositoryId !== repositoryId
          )
            throw invalid(t("main.historyReversalService.thisActionBelongsToAnotherContext"));

          if (current.refOperation?.state !== `${direction}ing`)
            throw invalid(
              t(
                "main.historyReversalService.theInterruptedDirectionChangedAfterReviewRefreshUndoRedo",
              ),
            );
          if (await this.workflows.observe(root, await this.git.status(root)))
            throw invalid(
              t("main.historyReversalService.finishOrAbortTheCurrentGitOperationFirst"),
            );

          const candidate = await finishRefConfiguration(this.git, current);

          candidate.updatedAt = new Date().toISOString();
          this.journal.save(candidate);
        }),
    );
  }

  async list(repositoryId: string): Promise<HistoryReversal[]> {
    const { records } = this.records(repositoryId);
    const results: HistoryReversal[] = [];

    for (const record of records) {
      if (record.recoveryWarning) {
        results.push({
          id: record.id,
          kind: record.mode as HistoryReversalKind,
          label: t("main.historyReversalService.undo", { message: record.message }),
          direction: "undo",
          available: false,
          fromHead: record.resultHead ?? "",
          toHead: record.head,
          publishedCommits: record.publishedCommits ?? 0,
          reason: record.recoveryWarning,
        });
        continue;
      }

      if (record.refOperation) {
        const operation = record.refOperation;
        const direction = ["undone", "redoing"].includes(operation.state) ? "redo" : "undo";
        const item: HistoryReversal = {
          kind: record.mode === "checkout" ? "checkout" : "branch",
          fromHead: (direction === "undo" ? operation.afterHead : operation.beforeHead) ?? "",
          toHead: (direction === "undo" ? operation.beforeHead : operation.afterHead) ?? "",
          id: record.id,
          direction,
          label: `${direction === "undo" ? t("main.historyReversalService.undoLabel") : t("main.historyReversalService.redo")} ${record.message}`,
          available: true,
          publishedCommits: 0,
          ...(record.branch ? { branch: record.branch } : {}),
        };

        try {
          const actual = await validateRefHistory(this.git, record);
          if (actual !== direction)
            throw invalid(
              t(
                "main.historyReversalService.theReferenceStateChangedAfterThisActionRefreshUndoRedo",
              ),
            );
        } catch (error) {
          item.available = false;
          item.reason =
            error instanceof Error
              ? error.message
              : t("main.historyReversalService.referenceStateCouldNotBeInspected");

          if (record.state !== "completed" || ["undoing", "redoing"].includes(operation.state)) {
            try {
              const reconciled = await this.reconciledRecord(record);
              item.reconciliation = reconciled.refOperation!.state as "applied" | "undone";
            } catch (failure) {
              try {
                await validatePendingBranchCheckout(this.git, record);
                item.resumeBranchCheckout = "original";
              } catch {
                try {
                  item.resumeBranchCheckout = await pendingBranchReversal(this.git, record);
                } catch {}
              }

              try {
                await validateUnstartedRefIntent(this.git, record);
                item.dismissUnstarted = true;
              } catch {}

              try {
                await pendingRefConfiguration(this.git, record);
                item.resumeConfiguration = true;
              } catch {}

              item.reason =
                failure instanceof Error
                  ? failure.message
                  : t("main.historyReversalService.referenceRecoveryIsIncomplete");
            }
          }
        }

        results.push(item);
        continue;
      }

      const reset = record.refChange!;

      if (record.mode === "reset" && record.state !== "completed" && !reset.reversal) {
        const item: HistoryReversal = {
          kind: "reset",
          mode: reset.mode,
          fromHead: record.head,
          toHead: reset.target,
          id: record.id,
          direction: "undo",
          label: t("main.historyReversalService.resumeInterruptedResetTo", {
            mode: reset.mode,
            target: reset.target.slice(0, 12),
          }),
          available: false,
          publishedCommits: record.publishedCommits ?? 0,
          ...(record.branch ? { branch: record.branch } : {}),
        };

        try {
          const inspection = await this.inspectInterruptedReset(record);

          item.publishedCommits = Math.max(
            item.publishedCommits,
            await publishedRangeCount(this.git, record.root, record.head, reset.target),
          );
          item.resumeReset = true;
          item.reason =
            inspection === "execute"
              ? t("main.historyReversalService.gitDidNotReachTheReviewedResetTarget")
              : t("main.historyReversalService.gitAlreadyReachedTheReviewedResetTargetResume");
        } catch (error) {
          item.reason =
            error instanceof Error
              ? error.message
              : t("main.historyReversalService.interruptedResetStateCouldNotBeInspected");
        }

        results.push(item);
        continue;
      }

      const direction = ["undone", "redoing"].includes(reset.reversal?.state ?? "")
        ? "redo"
        : "undo";
      const kind: HistoryReversalKind =
        record.mode === "commit" ||
        record.mode === "amend" ||
        record.mode === "rebase" ||
        record.mode === "cherry-pick" ||
        record.mode === "revert"
          ? record.mode
          : "reset";

      const item: HistoryReversal = {
        kind,
        mode: reset.mode,
        fromHead: direction === "undo" ? reset.target : record.head,
        toHead: direction === "undo" ? record.head : reset.target,
        id: record.id,
        direction,
        label:
          kind === "reset"
            ? t("main.historyReversalService.resetTo", {
                value1:
                  direction === "undo"
                    ? t("main.historyReversalService.undoLabel")
                    : t("main.historyReversalService.redo"),
                mode: reset.mode,
                target: reset.target.slice(0, 12),
              })
            : `${direction === "undo" ? t("main.historyReversalService.undoLabel") : t("main.historyReversalService.redo")} ${record.message}${kind === "rebase" && record.incoming[0] ? t("main.historyReversalService.onto", { value1: record.incoming[0].slice(0, 12) }) : ""}`,
        available: true,
        publishedCommits: 0,
        ...(record.branch ? { branch: record.branch } : {}),
      };

      try {
        await this.validate(record);
        item.publishedCommits = await publishedRangeCount(
          this.git,
          record.root,
          item.fromHead,
          item.toHead,
        );
      } catch (error) {
        item.available = false;
        item.reason =
          error instanceof Error
            ? error.message
            : t("main.historyReversalService.recoveryStateCouldNotBeInspected");

        if (["undoing", "redoing"].includes(reset.reversal?.state ?? "")) {
          try {
            const reconciled = await this.reconciledRecord(record);
            item.reconciliation = reconciled.refChange!.reversal!.state as "applied" | "undone";
          } catch {
            if (["mixed", "hard"].includes(reset.mode)) {
              try {
                await this.pendingIndex(record);
                item.resumeIndex = true;
              } catch (failure) {
                item.reason = failure instanceof Error ? failure.message : item.reason;
              }
            }
          }
        }
      }

      results.push(item);
    }

    return results;
  }

  private findRecord(root: string, id: string) {
    return (
      this.journal.historyActions(root).find((item) => item.id === id) ??
      this.journal.refActions(root).find((item) => item.id === id)
    );
  }

  execute(
    repositoryId: string,
    id: string,
    direction: HistoryDirection,
    expectedPublishedCommits?: number,
  ): Promise<void> {
    const { records } = this.records(repositoryId);
    const record = records.find((item) => item.id === id);

    if (!record)
      throw invalid(
        t("main.historyReversalService.thisActionIsNoLongerAvailableInTheCurrentProfileWorktree"),
      );

    return this.writer.remoteOperation(
      repositoryId,
      `${direction === "undo" ? t("operationTitles.undo") : t("operationTitles.redo")} ${record.mode === "reset" ? t("main.historyReversalService.reset", { mode: record.refChange!.mode }) : record.message}`,
      async (root, identity) => {
        if (record.refOperation) {
          const current = this.findRecord(root, id);

          if (
            !current?.refOperation ||
            current.profileId !== identity.id ||
            current.repositoryId !== repositoryId
          )
            throw invalid(t("main.historyReversalService.thisActionBelongsToAnotherContext"));

          const actual = await validateRefHistory(this.git, current);

          if (actual !== direction)
            throw invalid(
              t("main.historyReversalService.thisActionChangedAfterReviewRefreshUndoRedo"),
            );

          current.refOperation.state = direction === "undo" ? "undoing" : "redoing";
          current.updatedAt = new Date().toISOString();
          this.journal.save(current);

          try {
            await executeRefHistory(this.git, current, direction);
            current.refOperation.state = direction === "undo" ? "undone" : "applied";
          } finally {
            current.updatedAt = new Date().toISOString();
            this.journal.save(current);
          }

          return;
        }

        return withLockedIndex(this.git, root, async (lockedIndex) => {
          const current = this.journal.historyActions(root).find((item) => item.id === id);

          if (!current || current.profileId !== identity.id)
            throw invalid(t("main.historyReversalService.thisActionBelongsToAnotherContext"));

          const { undo, expectedHead, expectedRefs, snapshot } = await this.validate(current);

          if ((undo ? "undo" : "redo") !== direction)
            throw invalid(
              t("main.historyReversalService.thisActionChangedAfterReviewRefreshUndoRedo"),
            );

          const reset = current.refChange!;
          const reversal = reset.reversal!;
          const target = undo ? current.head : reset.target;
          const publishedCommits = await publishedRangeCount(this.git, root, expectedHead, target);

          if (
            expectedPublishedCommits !== undefined &&
            publishedCommits !== expectedPublishedCommits
          )
            throw invalid(
              t(
                "main.historyReversalService.remoteTrackingHistoryChangedAfterReviewRefreshUndoRedo",
              ),
            );

          let redo: Awaited<ReturnType<DiscardService["prepareOperation"]>> | undefined;

          if (undo && snapshot) {
            redo = await this.recovery.prepareOperation(
              root,
              current.profileId,
              repositoryId,
              snapshot.paths,
            );
            redo.record.source = "reset-recovery";
            await this.recovery.saveOperation(redo.record, redo.index);
            reversal.redoSnapshotId = redo.record.id;
          }

          reversal.state = undo ? "undoing" : "redoing";

          if (publishedCommits)
            current.publishedReversal = {
              fromHead: expectedHead,
              toHead: target,
              count: publishedCommits,
              direction,
              recordedAt: new Date().toISOString(),
            };

          current.updatedAt = new Date().toISOString();
          this.journal.save(current);

          try {
            const ref = current.branch ? `refs/heads/${current.branch}` : "HEAD";
            const change = !target
              ? `delete ${ref} ${expectedHead}`
              : !expectedHead
                ? `create ${ref} ${target}`
                : `update ${ref} ${target} ${expectedHead}`;

            await this.git.exec(
              ["update-ref", "--no-deref", "-m", `Eda: ${direction} ${current.message}`, "--stdin"],
              {
                cwd: root,
                operation: t("operations.reference", {
                  direction: stateLabel(direction),
                  mode: stateLabel(current.mode ?? ""),
                }),
                stdin: `${expectedRefs.map(([suffix, oid]) => `verify ${reset.recoveryRef}/${suffix} ${oid}`).join("\n")}\n${change}\n`,
                env: {
                  overrides: {
                    GIT_COMMITTER_NAME: identity.gitName,
                    GIT_COMMITTER_EMAIL: identity.gitEmail,
                  },
                },
              },
            );

            if (reset.mode !== "soft")
              await lockedIndex.prepare(
                undo ? reset.indexTree : reversal.afterIndexTree,
                t("operations.resetIndex", { direction: stateLabel(direction) }),
              );

            if (snapshot) await this.recovery.restoreOperationFiles(snapshot, snapshot.after!);
            if (reset.mode !== "soft") await lockedIndex.publish();
            if (redo) await this.recovery.finishOperation(redo.record);

            const after = await this.git.status(root);
            const fingerprint = await workflowFingerprint(this.git, root, after);
            const flags = (
              await this.git.exec(["ls-files", "-v", "-z"], {
                cwd: root,
                operation: t("operations.verifyReversedIndexFlags"),
              })
            ).stdout;

            const expectedFingerprint = undo
              ? this.beforeFingerprint(current)
              : reset.afterFingerprint;

            if (
              fingerprint !== expectedFingerprint ||
              flags !== (undo ? reversal.beforeFlags : reversal.afterFlags)
            )
              throw invalid(t("main.historyReversalService.theReversalDidNotFinishInTheRecorded"));

            reversal.expectedFingerprint = fingerprint;
            reversal.state = undo ? "undone" : "applied";
          } finally {
            current.updatedAt = new Date().toISOString();
            this.journal.save(current);
          }
        });
      },
    );
  }
}
