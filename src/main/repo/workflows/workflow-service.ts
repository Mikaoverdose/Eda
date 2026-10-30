import { t } from "@shared/i18n";
import { randomUUID, createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { GitError } from "@shared/errors";
import { conflictSides } from "@shared/workflows/conflict-sides";
import type {
  MergeContinuation,
  MergeAbortPreview,
  MergeStartPreview,
  MergeStartResult,
  MergeMode,
  WorkflowState,
} from "@shared/workflows/workflow";
import type { Identity } from "@shared/identity/identity";
import type { RepositoryStatus } from "@shared/repository/repository-read";
import { createPullAutostash, dropPullAutostash } from "../../git/operations/pull-autostash";
import { assertFullObjectId } from "../../git/validation";
import type { GitService } from "../../git/git-service";
import { readWorkflowState } from "../../git/operations/workflow-state";
import type { IdentityManager } from "../../identity/identity-manager";
import type { WorkflowJournal, WorkflowJournalRecord } from "../../persistence/workflow-journal";
import type { RepositoryManager } from "../lifecycle/repository-manager";
import type { RepositoryWriter } from "../working-tree/repository-writer";
import { DiscardService } from "../working-tree/discard-service";
import type { ContentRecoveryRepository } from "../../persistence/content-recovery-repository";

const invalid = (message: string) =>
  new GitError({
    kind: "invalid-input",
    operation: t("operations.mergeWorkflow"),
    message,
  });

function summary(record: WorkflowJournalRecord): MergeContinuation {
  const { id, message, author, email, signing, head, incoming, state, updatedAt, result } = record;

  return {
    id,
    message,
    author,
    email,
    signing,
    head,
    incoming,
    state,
    updatedAt,
    ...(record.mode === "squash" ? { squash: true } : {}),
    ...(result ? { result } : {}),
  };
}

export function matchesNativeWorkflow(
  record: WorkflowJournalRecord | undefined,
  workflow: WorkflowState,
): record is WorkflowJournalRecord {
  if (!record || record.head !== workflow.originalHead) return false;
  if (!record.nativeInstance || record.nativeInstance !== workflow.instance) return false;
  if (workflow.kind !== "rebase") return true;

  return (
    record.mode === "rebase" &&
    record.branch === (workflow.originalBranch ?? undefined) &&
    (record.incoming[0] ?? null) === (workflow.rebaseOnto ?? null)
  );
}

export class WorkflowService {
  private readonly starts = new Map<
    string,
    {
      preview: MergeStartPreview;
      root: string;
      repositoryId: string;
      identity: Identity;
      expires: number;
      autostash: boolean;
    }
  >();
  private readonly recovery: DiscardService;
  private readonly aborts = new Map<
    string,
    {
      snapshot: Awaited<ReturnType<DiscardService["prepareOperation"]>>;
      workflow: string;
      status: string;
      expires: number;
    }
  >();

  constructor(
    private readonly git: GitService,
    private readonly repositories: RepositoryManager,
    private readonly writer: RepositoryWriter,
    private readonly identity: IdentityManager,
    private readonly journal: WorkflowJournal,
    recovery: ContentRecoveryRepository,
  ) {
    this.recovery = new DiscardService(git, recovery);
  }

  async observe(root: string, status: RepositoryStatus): Promise<WorkflowState | null> {
    const native = await readWorkflowState(this.git, root, status);

    if (native) {
      const replay =
        native.kind === "rebase" || native.kind === "cherry-pick" || native.kind === "revert"
          ? this.journal.activeLocal(root, native.kind)
          : undefined;

      return matchesNativeWorkflow(replay, native)
        ? { ...native, ownerProfileId: replay.profileId }
        : native;
    }

    const record = this.journal.activeLocal(root);

    if (!record) return null;

    if (record.head !== status.branch.oid || record.branch !== status.branch.head) {
      return null;
    }

    const conflicts = status.changes
      .filter((item) => item.kind === "unmerged")
      .map((item) => item.path);
    const sides = conflictSides(record.mode === "stash" ? "stash" : "squash");

    return {
      kind: record.mode === "stash" ? "stash" : "squash",
      ownerProfileId: record.profileId,
      token: createHash("sha256")
        .update(JSON.stringify([record.id, record.head, record.incoming, conflicts]))
        .digest("hex"),
      head: record.head,
      originalHead: record.head,
      incoming: record.incoming,
      step: null,
      total: null,
      conflicts,
      currentLabel: t("main.workflowService.indexStage2", { current: sides.current }),
      incomingLabel: t("main.workflowService.indexStage3", { incoming: sides.incoming }),
    };
  }

  async restorePullAutostash(root: string, record: WorkflowJournalRecord): Promise<void> {
    const oid = record.pullAutostash;
    if (!oid) return;
    // Clear and save the stash reference first so a retry won't restore it twice.
    delete record.pullAutostash;
    this.journal.save(record);
    await this.restorePullAutostashInPlace(root, record.repositoryId, record.identity, oid);
  }

  async restorePullAutostashInPlace(
    root: string,
    repositoryId: string,
    identity: Identity,
    oid: string,
  ): Promise<void> {
    try {
      const applied = await this.applyStashInPlace(root, repositoryId, identity, oid, true);
      if (!applied) throw invalid(t("main.workflowService.localChangesNeedAttention"));
    } catch {
      throw invalid(
        t("main.workflowService.localChangesCouldNotBeFullyRestoredThey", {
          oid: oid.slice(0, 12),
        }),
      );
    }
    try {
      await dropPullAutostash(this.git, root, oid);
    } catch {
      throw invalid(
        t("main.workflowService.localChangesWereRestoredButTheTemporaryEda", {
          oid: oid.slice(0, 12),
        }),
      );
    }
  }

  private requireWorkflowOwner(workflow: WorkflowState, profileId: string) {
    if (workflow.ownerProfileId && workflow.ownerProfileId !== profileId)
      throw invalid(t("main.workflowService.thisOperationBelongsToAnotherProfileSwitchTo"));
  }

  private async cleanStart(root: string, allowChanges = false) {
    const status = await this.git.status(root);

    if (await this.observe(root, status))
      throw invalid(
        t("main.workflowService.finishOrAbortTheCurrentGitOperationBeforeStartingAnotherOperation"),
      );

    const previous = this.journal.activeLocal(root);

    if (previous) {
      previous.state = "completed";
      previous.updatedAt = new Date().toISOString();
      this.journal.save(previous);
    }

    if (!status.branch.oid || !status.branch.head || status.branch.detached || status.branch.unborn)
      throw invalid(t("main.workflowService.checkOutAnExistingBranchBeforeStartingThisOperation"));
    if (status.changes.length && !allowChanges)
      throw invalid(
        t("main.workflowService.commitStashOrMoveLocalChangesBeforeStartingThisOperation"),
      );

    return status;
  }

  async applyStashInPlace(
    root: string,
    repositoryId: string,
    identity: Identity,
    oid: string,
    restoreIndex: boolean,
  ): Promise<boolean> {
    assertFullObjectId(oid, t("operations.applyStash"));

    const status = await this.cleanStart(root);
    const parents = (
      await this.git.exec(["rev-list", "--parents", "-n", "1", oid], {
        cwd: root,
        operation: t("operations.inspectStashParents"),
      })
    ).stdout
      .trim()
      .split(" ")
      .slice(1);

    if (parents.length < 2 || parents.length > 3)
      throw invalid(t("main.workflowService.unsupportedStashStructure"));

    const introducedPaths = parents[2]
      ? (
          await this.git.exec(["ls-tree", "-r", "--name-only", "-z", parents[2]], {
            cwd: root,
            operation: t("operations.inspectRestoredStashPaths"),
            maxStdoutBytes: 1024 * 1024,
          })
        ).stdout
          .split("\0")
          .filter(Boolean)
      : [];

    const before = await this.recovery.prepareOperation(
      root,
      identity.id,
      repositoryId,
      introducedPaths,
    );

    if (
      before.record.files.some((file) => file.content !== null) ||
      before.record.savedIndex?.length
    )
      throw invalid(
        t("main.workflowService.aStashedUntrackedPathAlreadyExistsHereMoveItBeforeApplying"),
      );

    const record: WorkflowJournalRecord = {
      version: 1,
      id: randomUUID(),
      repositoryId,
      profileId: identity.id,
      root,
      workflowToken: "",
      tree: (
        await this.git.exec(["write-tree"], {
          cwd: root,
          operation: t("operations.captureStashIndex"),
        })
      ).stdout.trim(),
      identity,
      head: status.branch.oid!,
      branch: status.branch.head!,
      mode: "stash",
      incoming: [oid],
      introducedPaths,
      message: t("main.workflowService.applyStash"),
      author: identity.gitName,
      email: identity.gitEmail,
      signing: false,
      state: "running",
      updatedAt: new Date().toISOString(),
    };

    this.journal.save(record);

    try {
      const result = await this.git.exec(
        [
          "-c",
          "submodule.recurse=false",
          "stash",
          "apply",
          ...(restoreIndex ? ["--index"] : []),
          oid,
        ],
        {
          cwd: root,
          operation: t("operations.applyStash"),
          allowedExitCodes: [0, 1],
        },
      );

      const after = await this.git.status(root);
      const applied =
        result.exitCode === 0 && !after.changes.some((item) => item.kind === "unmerged");

      record.state = applied ? "completed" : "paused";

      return applied;
    } catch (error) {
      record.state = "paused";
      throw error;
    } finally {
      record.updatedAt = new Date().toISOString();
      this.journal.save(record);
    }
  }

  finishStash(repositoryId: string, token: string): Promise<void> {
    return this.writer.remoteOperation(
      repositoryId,
      t("main.workflowService.finishStashApplication"),
      async (root, identity) => {
        const workflow = await this.observe(root, await this.git.status(root));

        if (workflow?.kind !== "stash" || workflow.token !== token)
          throw invalid(t("main.workflowService.theStashOperationChangedRefreshBeforeFinishing"));

        this.requireWorkflowOwner(workflow, identity.id);

        if (workflow.conflicts.length)
          throw invalid(t("main.workflowService.resolveAndStageEveryConflictBeforeFinishing"));

        const record = this.journal.activeLocal(root)!;

        record.state = "completed";
        record.updatedAt = new Date().toISOString();
        this.journal.save(record);
      },
    );
  }

  private async predictMerge(
    root: string,
    head: string,
    source: string,
  ): Promise<MergeStartPreview["prediction"]> {
    try {
      const result = await this.git.exec(
        ["merge-tree", "--write-tree", "--name-only", "--no-messages", "-z", head, source],
        {
          cwd: root,
          operation: t("operations.predictMergeConflicts"),
          allowedExitCodes: [0, 1],
          maxStdoutBytes: 1024 * 1024,
        },
      );

      const [tree, ...records] = result.stdout.split("\0");

      assertFullObjectId(tree!, t("operations.inspectPredictedMergeTree"));

      const paths = records.filter(Boolean);

      return {
        state: result.exitCode === 0 ? "clean" : "conflicted",
        paths: paths.slice(0, 256),
        totalPaths: paths.length,
      };
    } catch (error) {
      if (!(error instanceof GitError) || error.kind === "cancelled") throw error;
      return { state: "unavailable", paths: [], totalPaths: 0, reason: error.message };
    }
  }

  prepareStart(
    repositoryId: string,
    source: string,
    mode: MergeMode,
    autostash = false,
  ): Promise<MergeStartPreview> {
    assertFullObjectId(source, t("operations.reviewMerge"));

    if (!["ff", "no-ff", "ff-only", "squash"].includes(mode))
      throw invalid(t("main.workflowService.chooseASupportedMergePolicy"));

    return this.writer.remoteOperation(
      repositoryId,
      t("main.workflowService.reviewMerge"),
      async (root, identity) => {
        const status = await this.cleanStart(root, autostash);

        await this.git.exec(["cat-file", "-e", `${source}^{commit}`], {
          cwd: root,
          operation: t("operations.validateMergeSource"),
        });

        const ancestor = async (a: string, b: string) =>
          (
            await this.git.exec(["merge-base", "--is-ancestor", a, b], {
              cwd: root,
              operation: t("operations.inspectMergeAncestry"),
              allowedExitCodes: [0, 1],
            })
          ).exitCode === 0;

        const preview: MergeStartPreview = {
          token: randomUUID(),
          source,
          head: status.branch.oid!,
          branch: status.branch.head!,
          mode,
          fastForward: await ancestor(status.branch.oid!, source),
          upToDate: await ancestor(source, status.branch.oid!),
          prediction: { state: "unavailable", paths: [], totalPaths: 0 },
        };

        if (mode === "ff-only" && !preview.fastForward && !preview.upToDate)
          throw invalid(
            t("main.workflowService.theseBranchesHaveDivergedFastForwardOnlyCannotMergeThem"),
          );

        preview.prediction = await this.predictMerge(root, preview.head, source);
        this.starts.set(preview.token, {
          preview,
          autostash,
          root,
          repositoryId,
          identity,
          expires: Date.now() + 300_000,
        });

        while (this.starts.size > 8) this.starts.delete(this.starts.keys().next().value!);

        return preview;
      },
    );
  }

  startMerge(repositoryId: string, token: string): Promise<MergeStartResult> {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    const pending = this.starts.get(token);

    if (
      !pending ||
      pending.expires < Date.now() ||
      pending.repositoryId !== repositoryId ||
      pending.root !== repository.path ||
      pending.identity.id !== repository.identityId
    )
      throw invalid(
        t("main.workflowService.thisMergeReviewExpiredOrBelongsToAnotherContextReviewAgain"),
      );

    return this.writer.remoteOperation(
      repositoryId,
      t("main.workflowService.mergeIntoCurrentBranch"),
      async (root) => {
        const status = await this.cleanStart(root, pending.autostash);
        const { preview, identity } = pending;

        if (status.branch.oid !== preview.head || status.branch.head !== preview.branch)
          throw invalid(
            t("main.workflowService.theTargetBranchChangedAfterReviewReviewTheMergeAgain"),
          );

        this.identity.assertOperationIdentity(identity);

        const tree = (
          await this.git.exec(["rev-parse", `${preview.head}^{tree}`], {
            cwd: root,
            operation: t("operations.captureMergeBaseTree"),
          })
        ).stdout.trim();
        const pullAutostash =
          pending.autostash && status.changes.length
            ? await createPullAutostash(this.git, root, identity)
            : undefined;
        const record: WorkflowJournalRecord = {
          ...(pullAutostash ? { pullAutostash } : {}),
          version: 1,
          id: randomUUID(),
          repositoryId,
          profileId: identity.id,
          root,
          workflowToken: "",
          tree,
          identity,
          head: preview.head,
          mode: preview.mode,
          branch: preview.branch,
          incoming: [preview.source],
          message: t("main.workflowService.commitInto", {
            value1:
              preview.mode === "squash"
                ? t("main.workflowService.squash")
                : t("main.workflowService.merge"),
            source: preview.source.slice(0, 12),
            branch: preview.branch,
          }),
          author: identity.gitName,
          email: identity.gitEmail,
          signing:
            identity.signing.signCommits &&
            identity.signing.format !== "none" &&
            !!identity.signing.keyRef,
          state: "running",
          updatedAt: new Date().toISOString(),
        };

        this.journal.save(record);
        this.starts.delete(token);

        try {
          const result = await this.git.exec(
            [
              "-c",
              "merge.autoStash=false",
              "-c",
              "submodule.recurse=false",
              "merge",
              ...(preview.mode === "squash" ? ["--ff", "--squash"] : [`--${preview.mode}`]),
              "--no-commit",
              "--no-edit",
              preview.source,
            ],
            {
              cwd: root,
              operation: t("operations.mergeIntoCurrentBranch"),
              allowedExitCodes: [0, 1],
            },
          );

          const after = await this.git.status(root);

          if (
            preview.mode === "squash" &&
            !preview.upToDate &&
            (result.exitCode === 0 || after.changes.some((item) => item.kind === "unmerged"))
          ) {
            record.state = "paused";

            return {
              state: after.changes.some((item) => item.kind === "unmerged")
                ? "conflicted"
                : "ready-to-commit",
              head: after.branch.oid!,
            };
          }

          const workflow = await readWorkflowState(this.git, root, after);

          if (workflow?.kind === "merge") {
            record.workflowToken = workflow.token;
            record.state = "paused";
            return {
              state: workflow.conflicts.length ? "conflicted" : "ready-to-commit",
              head: after.branch.oid!,
            };
          }

          if (result.exitCode !== 0)
            throw invalid(t("main.workflowService.gitCouldNotStartThisMergeInspectActivity"));

          record.state = "completed";
          record.result = after.branch.oid!;

          return { state: "completed", head: after.branch.oid! };
        } catch (error) {
          record.state =
            record.pullAutostash &&
            !(await readWorkflowState(this.git, root, await this.git.status(root)))
              ? "completed"
              : "paused";
          throw error;
        } finally {
          record.updatedAt = new Date().toISOString();
          this.journal.save(record);
          if (record.state === "completed") await this.restorePullAutostash(root, record);
        }
      },
    );
  }

  prepareAbort(repositoryId: string): Promise<MergeAbortPreview> {
    const repository = this.repositories.resolveActiveRepository(repositoryId);

    return this.writer.remoteOperation(
      repositoryId,
      t("main.workflowService.reviewMergeAbort"),
      async (root) => {
        const status = await this.git.status(root);
        const workflow = await this.observe(root, status);

        if (
          (workflow?.kind !== "merge" &&
            workflow?.kind !== "squash" &&
            workflow?.kind !== "stash") ||
          !workflow.originalHead
        )
          throw invalid(
            t("main.workflowService.noNativeMergeOrEdaSquashWithAnOriginalHeadIsAvailableToAbort"),
          );

        this.requireWorkflowOwner(workflow, repository.identityId);

        const paths = new Set(
          status.changes
            .filter((item) => item.kind !== "untracked" && item.kind !== "ignored")
            .flatMap((item) => (item.originalPath ? [item.path, item.originalPath] : [item.path])),
        );

        if (workflow.kind === "stash")
          for (const path of this.journal.activeLocal(root)?.introducedPaths ?? []) paths.add(path);

        const affected = await this.git.exec(
          [
            "diff",
            "--name-only",
            "-z",
            "--no-renames",
            "--no-ext-diff",
            "--no-textconv",
            workflow.originalHead,
            "--",
          ],
          {
            cwd: root,
            operation: t("operations.inspectAbortPaths"),
            maxStdoutBytes: 1024 * 1024,
          },
        );

        for (const path of affected.stdout.split("\0").filter(Boolean)) paths.add(path);

        const autostash = await this.git.exec(
          ["rev-parse", "--verify", "--quiet", "MERGE_AUTOSTASH"],
          {
            cwd: root,
            operation: t("operations.inspectMergeAutostash"),
            allowedExitCodes: [0, 1],
          },
        );

        if (autostash.stdout.trim()) {
          const oid = autostash.stdout.trim();

          if (!/^[a-f0-9]{40,64}$/.test(oid))
            throw invalid(
              t("main.workflowService.invalidNativeAutostashStateInspectItWithGitBeforeAborting"),
            );

          const changed = await this.git.exec(
            [
              "diff",
              "--name-only",
              "-z",
              "--no-renames",
              "--no-ext-diff",
              "--no-textconv",
              `${oid}^1`,
              oid,
              "--",
            ],
            {
              cwd: root,
              operation: t("operations.inspectAutostashPaths"),
              maxStdoutBytes: 1024 * 1024,
            },
          );

          for (const path of changed.stdout.split("\0").filter(Boolean)) paths.add(path);
        }

        const snapshot = await this.recovery.prepareOperation(
          root,
          repository.identityId,
          repositoryId,
          [...paths],
        );

        const token = randomUUID();

        if (workflow.kind === "stash") snapshot.record.source = "stash-abort";

        this.aborts.set(token, {
          snapshot,
          workflow: workflow.token,
          status: JSON.stringify(status),
          expires: Date.now() + 300_000,
        });

        while (this.aborts.size > 2) this.aborts.delete(this.aborts.keys().next().value!);

        return {
          token,
          paths: [...paths],
          bytes: snapshot.record.bytes,
          originalHead: workflow.originalHead,
        };
      },
    );
  }

  abortMerge(repositoryId: string, token: string): Promise<void> {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    const pending = this.aborts.get(token);

    if (
      !pending ||
      pending.expires < Date.now() ||
      pending.snapshot.record.repositoryId !== repositoryId ||
      pending.snapshot.record.profileId !== repository.identityId ||
      pending.snapshot.record.root !== repository.path
    )
      throw invalid(
        t("main.workflowService.theAbortReviewExpiredOrBelongsToAnotherContextReviewAgain"),
      );

    return this.writer.remoteOperation(
      repositoryId,
      t("main.workflowService.abortMerge"),
      async (root) => {
        const status = await this.git.status(root);
        const workflow = await this.observe(root, status);

        if (
          (workflow?.kind !== "merge" &&
            workflow?.kind !== "squash" &&
            workflow?.kind !== "stash") ||
          workflow.token !== pending.workflow ||
          JSON.stringify(status) !== pending.status
        )
          throw invalid(
            t(
              "main.workflowService.theMergeOrRepositoryStateChangedAfterReviewReviewTheAbortAgain",
            ),
          );

        this.requireWorkflowOwner(workflow, repository.identityId);
        await this.recovery.saveOperation(pending.snapshot.record, pending.snapshot.index);
        this.aborts.delete(token);

        try {
          await this.git.exec(
            [
              "-c",
              "submodule.recurse=false",
              ...(workflow.kind !== "merge"
                ? ["reset", "--merge", workflow.originalHead!]
                : ["merge", "--abort"]),
            ],
            {
              cwd: root,
              operation: t("operations.abortMerge"),
            },
          );

          const record = this.journal.latest(repository.identityId, repositoryId);

          if (workflow.kind === "stash")
            await this.recovery.removeIntroduced(
              pending.snapshot.record,
              this.journal.activeLocal(root)?.introducedPaths ?? [],
            );

          if (
            record &&
            record.root === root &&
            record.head === workflow.head &&
            record.incoming.join(" ") === workflow.incoming.join(" ")
          ) {
            record.state = "completed";
            record.updatedAt = new Date().toISOString();
            this.journal.save(record);
            await this.restorePullAutostash(root, record);
          }
        } catch (error) {
          throw new GitError({
            kind: error instanceof GitError ? error.kind : "unknown",
            operation: t("operations.abortMerge"),
            message: t(
              "main.workflowService.recoveryCopiesWereSavedInspectRecoveryBeforeChanging",
              {
                value1:
                  error instanceof Error
                    ? error.message
                    : t("main.workflowService.gitCouldNotAbortTheMerge"),
              },
            ),
          });
        } finally {
          await this.recovery.finishOperation(pending.snapshot.record);
        }
      },
    );
  }

  private async inspect(root: string) {
    const status = await this.git.status(root);
    const workflow = await this.observe(root, status);

    if ((workflow?.kind !== "merge" && workflow?.kind !== "squash") || !workflow.head)
      throw invalid(t("main.workflowService.thereIsNoNativeMergeToContinueRefreshRepositoryState"));
    if (workflow.conflicts.length)
      throw invalid(
        t("main.workflowService.resolveAndStageEveryConflictedPathBeforeContinuingTheMerge"),
      );

    const { stdout } = await this.git.exec(["write-tree"], {
      cwd: root,
      operation: t("operations.inspectMergeIndex"),
    });

    return { workflow, tree: stdout.trim() };
  }

  prepareMerge(repositoryId: string): Promise<MergeContinuation> {
    const repository = this.repositories.resolveActiveRepository(repositoryId);

    return this.writer.remoteOperation(
      repositoryId,
      t("main.workflowService.reviewMergeCompletion"),
      async (root, identity) => {
        const { workflow, tree } = await this.inspect(root);

        this.requireWorkflowOwner(workflow, repository.identityId);

        const previous = this.journal.latest(repository.identityId, repositoryId);

        if (
          previous &&
          previous.root === root &&
          previous.workflowToken === workflow.token &&
          previous.tree === tree &&
          previous.state !== "completed"
        ) {
          if (previous.state === "running") {
            previous.state = "paused";
            previous.updatedAt = new Date().toISOString();
            this.journal.save(previous);
          }
          return summary(previous);
        }

        const { stdout } = await this.git.exec(["rev-parse", "--absolute-git-dir"], {
          cwd: root,
          operation: t("operations.readMergeMessage"),
        });
        const handle = await open(
          join(stdout.trim(), workflow.kind === "squash" ? "SQUASH_MSG" : "MERGE_MSG"),
          "r",
        );
        let message: string;

        try {
          const buffer = Buffer.alloc(1024 * 1024 + 1);
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          if (bytesRead > 1024 * 1024)
            throw invalid(t("main.workflowService.theMergeMessageExceedsThe1MiBEditorLimit"));
          message = buffer.subarray(0, bytesRead).toString("utf8");
        } finally {
          await handle.close();
        }

        const sameOperation =
          previous?.head === workflow.head &&
          previous.root === root &&
          previous.incoming.join(" ") === workflow.incoming.join(" ") &&
          previous.state !== "completed";
        const captured = sameOperation ? previous.identity : identity;
        const record: WorkflowJournalRecord = {
          version: 1,
          id: sameOperation && previous.mode === "squash" ? previous.id : randomUUID(),
          ...(sameOperation
            ? {
                mode: previous.mode,
                branch: previous.branch,
                ...(previous.pullAutostash ? { pullAutostash: previous.pullAutostash } : {}),
              }
            : {}),
          repositoryId,
          profileId: identity.id,
          root,
          workflowToken: workflow.token,
          tree,
          identity: captured,
          message: sameOperation ? previous.message : message,
          author: captured.gitName,
          email: captured.gitEmail,
          signing:
            captured.signing.signCommits &&
            captured.signing.format !== "none" &&
            !!captured.signing.keyRef,
          head: workflow.head!,
          incoming: workflow.incoming,
          state: "prepared",
          updatedAt: new Date().toISOString(),
        };

        this.journal.save(record);

        return summary(record);
      },
    );
  }

  continueMerge(repositoryId: string, id: string, message: string): Promise<string> {
    if (!message.trim() || Buffer.byteLength(message) > 1024 * 1024)
      throw invalid(t("main.workflowService.enterAMergeMessageWithinThe1MiBLimit"));

    const repository = this.repositories.resolveActiveRepository(repositoryId);
    const record = this.journal.latest(repository.identityId, repositoryId);

    if (
      !record ||
      record.id !== id ||
      record.root !== repository.path ||
      record.state === "completed"
    )
      throw invalid(t("main.workflowService.reviewThisMergeAgainBeforeCompletingIt"));

    return this.writer.remoteOperation(
      repositoryId,
      t("main.workflowService.continueMerge"),
      async (root) => {
        const { workflow, tree } = await this.inspect(root);

        this.requireWorkflowOwner(workflow, repository.identityId);

        if (workflow.token !== record.workflowToken || tree !== record.tree)
          throw invalid(
            t("main.workflowService.theMergeOrStagedContentChangedReviewItAgainBeforeCommitting"),
          );

        this.identity.assertOperationIdentity(record.identity);

        record.message = message;
        record.state = "running";
        record.updatedAt = new Date().toISOString();
        this.journal.save(record);

        try {
          const oid = await this.git.commit(root, message, {}, record.identity);
          record.state = "completed";
          record.result = oid;
          return oid;
        } catch (error) {
          record.state = "paused";
          throw error;
        } finally {
          record.updatedAt = new Date().toISOString();
          this.journal.save(record);
          if (record.state === "completed") await this.restorePullAutostash(root, record);
        }
      },
    );
  }
}
