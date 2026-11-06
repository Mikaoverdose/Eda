import { errorText, type ErrorText } from "@shared/error-codes";
import { errorMessage, GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { stateLabel } from "@shared/i18n/labels";
import type { Identity } from "@shared/identity/identity";
import type { RebaseAction, RebaseResult, RebaseReview } from "@shared/workflows/rebase";
import { randomUUID } from "node:crypto";
import type { GitService } from "../../git/git-service";
import { createPullAutostash } from "../../git/operations/pull-autostash";
import {
  readRebasePlan,
  rebaseMessageEditor,
  removeRebasePlan,
  validateRebasePlan,
  writeRebasePlan,
} from "../../git/operations/rebase-plan";
import { assertFullObjectId } from "../../git/validation";
import { assertSafeRebaseState } from "../../git/security/rebase-state";
import type { IdentityManager } from "../../identity/identity-manager";
import type { ContentRecoveryRepository } from "../../persistence/content-recovery-repository";
import type { WorkflowJournal, WorkflowJournalRecord } from "../../persistence/workflow-journal";
import { PreviewStore } from "../preview-store";
import { captureRewriteStart, finalizeRewrite } from "../history/rewrite-history";
import { publishedRangeCount } from "../history/shared-history";
import type { RepositoryManager } from "../lifecycle/repository-manager";
import { DiscardService, type OperationSnapshot } from "../working-tree/discard-service";
import type { RepositoryWriter } from "../working-tree/repository-writer";
import { workflowFingerprint } from "./workflow-fingerprint";
import { matchesNativeWorkflow, type WorkflowService } from "./workflow-service";

const invalid = (message: ErrorText) =>
  new GitError({ kind: "invalid-input", operation: t("operations.rebase"), message });

export class RebaseService {
  private readonly recovery: DiscardService;
  private readonly reviews = new PreviewStore<{
    review: RebaseReview;
    root: string;
    repositoryId: string;
    identity: Identity;
    workflowToken: string | null;
    fingerprint: string;
    record?: WorkflowJournalRecord;
    snapshot?: OperationSnapshot;
    autostash: boolean;
  }>();

  constructor(
    private readonly git: GitService,
    private readonly repositories: RepositoryManager,
    private readonly writer: RepositoryWriter,
    private readonly identities: IdentityManager,
    private readonly workflows: WorkflowService,
    private readonly journal: WorkflowJournal,
    recovery: ContentRecoveryRepository,
  ) {
    this.recovery = new DiscardService(git, recovery);
  }

  prepare(
    repositoryId: string,
    action: RebaseAction,
    onto?: string,
    interactive = false,
    autostash = false,
  ): Promise<RebaseReview> {
    if (!["start", "continue", "skip", "abort", "amend"].includes(action))
      throw invalid(errorText("main.rebaseService.chooseARebaseAction"));
    if (action === "start") assertFullObjectId(onto ?? "", t("operations.reviewRebaseBase"));

    return this.writer.remoteOperation(
      repositoryId,
      t("main.rebaseService.reviewRebase"),
      async (root, identity) => {
        const status = await this.git.status(root);
        const workflow = await this.workflows.observe(root, status);
        let record = this.journal.activeLocal(root, "rebase");

        if (action === "start") {
          if (
            workflow ||
            (!autostash && status.changes.length) ||
            status.branch.detached ||
            !status.branch.head ||
            !status.branch.oid
          )
            throw invalid(errorText("main.rebaseService.checkOutACleanExistingBranchAndFinish"));

          await this.git.exec(["cat-file", "-e", `${onto}^{commit}`], {
            cwd: root,
            operation: t("operations.validateRebaseBase"),
          });

          const merges = await this.git.exec(
            ["rev-list", "--merges", "--max-count=1", `${onto}..HEAD`],
            { cwd: root, operation: t("operations.inspectRebaseTopology") },
          );

          if (merges.stdout.trim())
            throw invalid(
              errorText("main.rebaseService.thisRangeContainsMergeCommitsMergePreservingRebase"),
            );

          if (interactive) {
            const roots = await this.git.exec(
              ["rev-list", "--max-parents=0", "--max-count=1", `${onto}..HEAD`],
              { cwd: root, operation: t("operations.inspectRebaseRoots") },
            );

            if (roots.stdout.trim())
              throw invalid(errorText("main.rebaseService.rootEditingIsNotSupportedChooseABase"));
          }

          record = undefined;
        } else {
          if (workflow?.kind !== "rebase" || !workflow.originalHead)
            throw invalid(
              errorText("main.rebaseService.noNativeRebaseIsAvailableRefreshRepositoryState"),
            );
          if (!matchesNativeWorkflow(record, workflow)) record = undefined;

          if (record && record.profileId !== identity.id)
            throw invalid(
              errorText(
                "main.rebaseService.switchToTheProfileThatOwnsThisRebaseBeforeContinuingOrAborting",
              ),
            );

          if (action === "continue" && workflow.conflicts.length)
            throw invalid(
              errorText("main.rebaseService.resolveAndStageEveryConflictBeforeContinuing"),
            );
          if (action === "amend" && !workflow.rebaseEdit)
            throw invalid(
              errorText("main.rebaseService.amendIsOnlyAvailableAtAResolvedInteractiveEditStop"),
            );

          if (action === "skip" && workflow.rebaseEdit)
            throw invalid(errorText("main.rebaseService.thisCommitHasAlreadyBeenReplayedAmendOr"));
          if (action === "continue" || action === "skip")
            await assertSafeRebaseState(this.git, root);
        }

        const captured = record?.identity ?? identity;
        let snapshot: OperationSnapshot | undefined;

        if (action === "skip" || action === "abort") {
          const paths = new Set(
            status.changes
              .filter((item) => item.kind !== "untracked" && item.kind !== "ignored")
              .flatMap((item) =>
                item.originalPath ? [item.path, item.originalPath] : [item.path],
              ),
          );

          if (action === "abort") {
            const changed = await this.git.exec(
              [
                "diff",
                "--name-only",
                "-z",
                "--no-renames",
                "--no-ext-diff",
                "--no-textconv",
                workflow!.originalHead!,
                "--",
              ],
              { cwd: root, operation: t("operations.reviewRebaseAbortPaths") },
            );

            for (const path of changed.stdout.split("\0").filter(Boolean)) paths.add(path);
          }

          snapshot = await this.recovery.prepareOperation(root, identity.id, repositoryId, [
            ...paths,
          ]);
          snapshot.record.source = "rebase-recovery";
        }

        const review: RebaseReview = {
          token: randomUUID(),
          action,
          head: action === "start" ? status.branch.oid! : workflow!.originalHead!,
          onto: action === "start" ? onto! : (workflow!.rebaseOnto ?? null),
          branch:
            action === "start"
              ? (status.branch.head ?? null)
              : (record?.branch ?? workflow!.originalBranch ?? null),
          author: captured.gitName,
          email: captured.gitEmail,
          paths:
            action === "amend"
              ? status.changes
                  .filter((item) => ![".", "?", "!"].includes(item.index))
                  .map((item) => item.path)
              : (snapshot?.record.paths ?? []),
          recoveryBytes: snapshot?.record.bytes ?? 0,
          publishedCommits:
            action === "start"
              ? await publishedRangeCount(this.git, root, status.branch.oid!, onto!)
              : Math.max(
                  record?.publishedCommits ?? 0,
                  await publishedRangeCount(
                    this.git,
                    root,
                    workflow!.originalHead!,
                    workflow!.rebaseOnto ?? workflow!.head ?? "",
                  ),
                ),
          ...(action === "amend"
            ? {
                message:
                  record?.amendMessage ??
                  (
                    await this.git.exec(["show", "-s", "--format=%B", "HEAD"], {
                      cwd: root,
                      operation: t("operations.reviewEditStopMessage"),
                      maxStdoutBytes: 64 * 1024,
                    })
                  ).stdout.trimEnd(),
              }
            : {}),
          ...(action === "start" && interactive
            ? { plan: await readRebasePlan(this.git, root, onto!) }
            : {}),
        };

        this.reviews.set(review.token, {
          review,
          autostash,
          root,
          repositoryId,
          identity: captured,
          ...(record ? { record } : {}),
          ...(snapshot ? { snapshot } : {}),
          workflowToken: workflow?.token ?? null,
          fingerprint: await workflowFingerprint(this.git, root, status),
        });

        return review;
      },
    );
  }

  execute(
    repositoryId: string,
    token: string,
    inputPlan?: unknown,
    message?: unknown,
  ): Promise<RebaseResult> {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    const pending = this.reviews.get(token);

    if (
      !pending ||
      pending.repositoryId !== repositoryId ||
      pending.root !== repository.path ||
      pending.identity.id !== repository.identityId
    )
      throw invalid(
        errorText("main.rebaseService.thisRebaseReviewExpiredOrBelongsToAnotherContextReviewAgain"),
      );

    const plan = pending.review.plan
      ? validateRebasePlan(inputPlan, pending.review.plan)
      : undefined;

    if (!plan && inputPlan !== undefined)
      throw invalid(errorText("main.rebaseService.reviewAnInteractivePlanBeforeEditingCommits"));

    if (
      pending.review.action === "amend" &&
      (typeof message !== "string" ||
        !message.trim() ||
        message.includes("\0") ||
        Buffer.byteLength(message) > 64 * 1024)
    )
      throw invalid(errorText("main.rebaseService.enterAnAmendMessageWithin64KiB"));

    return this.writer.remoteOperation(repositoryId, t("operationTitles.rebase"), async (root) => {
      const { review, identity } = pending;
      const status = await this.git.status(root);
      const workflow = await this.workflows.observe(root, status);

      if (
        (workflow?.token ?? null) !== pending.workflowToken ||
        (await workflowFingerprint(this.git, root, status)) !== pending.fingerprint
      )
        throw invalid(
          errorText("main.rebaseService.theRebaseOrRepositoryChangedAfterReviewReviewAgain"),
        );

      if (workflow?.ownerProfileId && workflow.ownerProfileId !== identity.id)
        throw invalid(errorText("main.rebaseService.anotherProfileOwnsThisRebase"));

      if (
        Math.max(
          pending.record?.publishedCommits ?? 0,
          await publishedRangeCount(
            this.git,
            root,
            review.head,
            review.onto ?? workflow?.head ?? "",
          ),
        ) !== review.publishedCommits
      )
        throw invalid(
          errorText("main.rebaseService.remoteTrackingHistoryChangedAfterReviewReviewAgain"),
        );

      if (review.action !== "abort") this.identities.assertOperationIdentity(identity);
      if (review.action === "continue" || review.action === "skip")
        await assertSafeRebaseState(this.git, root);

      if (pending.snapshot)
        await this.recovery.saveOperation(pending.snapshot.record, pending.snapshot.index);

      const record: WorkflowJournalRecord = pending.record ?? {
        version: 1,
        id: randomUUID(),
        repositoryId,
        profileId: identity.id,
        root,
        identity,
        mode: "rebase",
        publishedCommits: review.publishedCommits,
        ...(plan ? { interactive: true } : {}),
        head: review.head,
        ...(review.branch ? { branch: review.branch } : {}),
        incoming: review.onto ? [review.onto] : [],
        workflowToken: pending.workflowToken ?? "",
        tree: "",
        message: t("main.rebaseService.rebase"),
        author: identity.gitName,
        email: identity.gitEmail,
        signing: identity.signing.signCommits,
        state: "prepared",
        updatedAt: new Date().toISOString(),
      };

      record.state = "running";

      if (workflow?.instance && !record.nativeInstance) record.nativeInstance = workflow.instance;

      record.publishedCommits = review.publishedCommits;

      if (review.action === "amend") record.amendMessage = message as string;

      this.journal.save(record);
      this.reviews.delete(token);

      try {
        if (review.action === "start" && pending.autostash && status.changes.length) {
          record.pullAutostash = await createPullAutostash(this.git, root, identity);
          this.journal.save(record);
        }
        const rewriteStart =
          review.action === "amend" || review.action === "abort"
            ? undefined
            : (record.rewriteStart ?? (await captureRewriteStart(this.git, root)));

        if (rewriteStart && !record.rewriteStart) {
          record.rewriteStart = rewriteStart;
          this.journal.save(record);
        }

        const signing = identity.signing;
        const config = {
          "user.name": identity.gitName,
          "user.email": identity.gitEmail,
          "gpg.format": signing.format === "ssh" ? "ssh" : "openpgp",
          "user.signingkey": signing.keyRef ?? "",
          "commit.gpgsign":
            signing.format !== "none" && !!signing.keyRef && signing.signCommits ? "true" : "false",
          "rebase.autoStash": "false",
          "rebase.updateRefs": "false",
          "submodule.recurse": "false",
          "rebase.abbreviateCommands": "false",
          ...(record.interactive ? { "commit.cleanup": "whitespace" } : {}),
        };

        if (review.action === "amend") {
          const head = await this.git.commit(
            root,
            message as string,
            { amend: true, allowEmpty: true },
            identity,
          );

          record.state = "paused";
          delete record.amendMessage;

          return { state: "needs-attention", head };
        }

        const sequenceEditor = plan
          ? await writeRebasePlan(this.git, root, record.id, plan)
          : "true";
        const result = await this.git.exec(
          [
            ...Object.entries(config).flatMap(([key, value]) => ["-c", `${key}=${value}`]),
            "rebase",
            ...(review.action === "start"
              ? [
                  "--merge",
                  "--no-autostash",
                  "--no-rebase-merges",
                  ...(plan
                    ? [
                        "--interactive",
                        "--no-autosquash",
                        "--no-fork-point",
                        "--reapply-cherry-picks",
                        "--keep-empty",
                        "--empty=keep",
                      ]
                    : []),
                  review.onto!,
                ]
              : [`--${review.action}`]),
          ],
          {
            cwd: root,
            operation: t("operations.rebaseLabel", { action: stateLabel(review.action) }),
            allowedExitCodes: [0, 1],
            env: {
              ...(identity.sshKeyPath ? { sshKeyPath: identity.sshKeyPath } : {}),
              overrides: {
                GIT_EDITOR: record.interactive
                  ? await rebaseMessageEditor(this.git, root, record.id)
                  : "true",
                GIT_SEQUENCE_EDITOR: sequenceEditor,
                GIT_COMMITTER_NAME: identity.gitName,
                GIT_COMMITTER_EMAIL: identity.gitEmail,
              },
            },
          },
        );

        const after = await this.git.status(root);

        if (after.branch.oid) record.resultHead = after.branch.oid;

        const remaining = await this.workflows.observe(root, after);

        if (remaining?.instance && !record.nativeInstance)
          record.nativeInstance = remaining.instance;

        record.state = remaining?.kind === "rebase" ? "paused" : "completed";

        if (result.exitCode !== 0 && !remaining)
          throw invalid(errorText("main.rebaseService.gitCouldNotCompleteTheRebaseActionInspect"));

        if (record.state === "completed" && rewriteStart) {
          try {
            await finalizeRewrite(
              this.git,
              this.journal,
              this.recovery,
              record,
              after.branch.oid ?? null,
              rewriteStart,
            );
          } catch (error) {
            record.recoveryWarning = t(
              "main.rebaseService.rebaseCompletedButAutomaticUndoCouldNotBe",
              {
                head: record.head,
                value2: errorMessage(
                  error,
                  errorText("main.rebaseService.recoveryMetadataCouldNotBeSaved"),
                ),
              },
            );
          }
        }

        return {
          state: remaining ? "needs-attention" : "completed",
          head: after.branch.oid ?? null,
          ...(record.recoveryWarning ? { recoveryWarning: record.recoveryWarning } : {}),
          publishedCommits:
            !remaining && review.action !== "abort" && after.branch.oid !== record.head
              ? (record.publishedCommits ?? 0)
              : 0,
        };
      } finally {
        if (record.state === "running") {
          record.state = "paused";

          try {
            const remaining = await this.workflows.observe(root, await this.git.status(root));
            if (remaining?.instance && !record.nativeInstance)
              record.nativeInstance = remaining.instance;
            if (remaining?.kind !== "rebase") record.state = "completed";
          } catch {}
        }

        record.updatedAt = new Date().toISOString();
        this.journal.save(record);

        if (pending.snapshot) await this.recovery.finishOperation(pending.snapshot.record);
        if (record.state === "completed" && record.interactive)
          await removeRebasePlan(this.git, root, record.id);
        if (record.state === "completed") await this.workflows.restorePullAutostash(root, record);
      }
    });
  }
}
