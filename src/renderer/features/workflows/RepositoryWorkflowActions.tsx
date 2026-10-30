import { workflowLabel, replayActionLabel } from "@shared/i18n/labels";
import { t } from "@shared/i18n";
import { useState } from "react";
import type { WorkflowState } from "@shared/workflows/workflow";
import type { RebaseAction } from "@shared/workflows/rebase";
import type { ReplayAction, ReplayKind } from "@shared/workflows/replay";
import { useRepositoryStore } from "../../stores/repository-store";
import { ErrorDialog, TextButton } from "../../components/ui/index";
import { RebaseDialog } from "./RebaseDialog";
import { ReplayDialog } from "./ReplayDialog";
import { MergeContinueDialog } from "./MergeContinueDialog";
import { MergeAbortDialog } from "./MergeAbortDialog";

export function RepositoryWorkflowActions({
  repositoryId,
  workflow,
  writing,
  conflicts,
}: {
  repositoryId: string;
  workflow: WorkflowState | null | undefined;
  writing: boolean;
  conflicts: number;
}) {
  const [rebaseAction, setRebaseAction] = useState<RebaseAction | null>(null);
  const [replayAction, setReplayAction] = useState<{
    kind: ReplayKind;
    action: ReplayAction;
  } | null>(null);
  const [mergeFor, setMergeFor] = useState<string | null>(null);
  const [abortFor, setAbortFor] = useState<string | null>(null);
  const [stashError, setStashError] = useState<string | null>(null);
  const [finishingStash, setFinishingStash] = useState(false);

  return (
    <>
      {workflow?.kind === "rebase" && (
        <>
          {workflow.rebaseEdit && (
            <>
              <span className="text-xs text-text-secondary">
                {t("workflows.repositoryWorkflowActions.pausedForEditingStageChangesThenAmend")}
              </span>
              <TextButton
                disabled={writing}
                className="text-xs text-accent-text"
                onClick={() => setRebaseAction("amend")}
              >
                {t("workflows.repositoryWorkflowActions.amendPausedCommit")}
              </TextButton>
            </>
          )}
          <TextButton
            disabled={writing || conflicts > 0}
            onClick={() => setRebaseAction("continue")}
            className="text-xs text-accent-text disabled:opacity-50"
          >
            {t("workflows.repositoryWorkflowActions.continueRebase")}
          </TextButton>
          <TextButton
            disabled={writing || workflow.rebaseEdit}
            onClick={() => setRebaseAction("skip")}
            title={
              workflow.rebaseEdit
                ? t(
                    "workflows.repositoryWorkflowActions.thisCommitIsAlreadyReplayedAmendOrContinueOrAbortToChangeThePlan",
                  )
                : undefined
            }
            className="text-xs text-text-secondary"
          >
            {t("workflows.repositoryWorkflowActions.skipCommit")}
          </TextButton>
          <TextButton
            disabled={writing}
            onClick={() => setRebaseAction("abort")}
            className="text-xs text-git-deleted"
          >
            {t("workflows.repositoryWorkflowActions.abortRebase")}
          </TextButton>
        </>
      )}
      {workflow && (
        <span
          role="status"
          className="text-git-conflict"
          title={`${workflow.currentLabel}; ${workflow.incomingLabel}`}
        >
          {t("workflows.repositoryWorkflowActions.inProgress", {
            kind: workflowLabel(workflow.kind),
            value2: workflow.step !== null ? `, ${workflow.step}/${workflow.total ?? "?"}` : "",
          })}
        </span>
      )}
      {(workflow?.kind === "cherry-pick" || workflow?.kind === "revert") &&
        (["continue", "skip", "abort"] as const).map((action) => (
          <TextButton
            key={action}
            disabled={writing || (action === "continue" && conflicts > 0)}
            className="text-xs text-accent-text disabled:opacity-50"
            onClick={() => setReplayAction({ kind: workflow!.kind as ReplayKind, action })}
          >
            {replayActionLabel(workflow!.kind as ReplayKind, action)}...
          </TextButton>
        ))}
      {(workflow?.kind === "merge" ||
        workflow?.kind === "squash" ||
        workflow?.kind === "stash") && (
        <TextButton
          className="text-git-deleted disabled:opacity-50"
          disabled={writing}
          onClick={() => setAbortFor(repositoryId)}
        >
          {workflow?.kind === "stash"
            ? t("workflows.repositoryWorkflowActions.abortStashApplication")
            : t("workflows.repositoryWorkflowActions.abortMerge")}
        </TextButton>
      )}
      {workflow?.kind === "stash" && (
        <TextButton
          disabled={writing || finishingStash || conflicts > 0}
          title={t(
            "workflows.repositoryWorkflowActions.keepTheResolvedChangesAndSourceStashWithoutCommitting",
          )}
          onClick={async () => {
            setFinishingStash(true);
            setStashError(null);

            try {
              const result = await window.eda.workflows.finishStash(repositoryId, workflow!.token);
              if (!result.ok) setStashError(result.error.message);
              await useRepositoryStore.getState().syncFromDisk();
            } finally {
              setFinishingStash(false);
            }
          }}
          className="text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          {t("workflows.repositoryWorkflowActions.finishStashApplication")}
        </TextButton>
      )}
      {stashError && <ErrorDialog>{stashError}</ErrorDialog>}
      {(workflow?.kind === "merge" || workflow?.kind === "squash") && (
        <TextButton
          className="text-accent-text disabled:opacity-50"
          disabled={conflicts > 0 || writing}
          title={
            conflicts
              ? t("workflows.repositoryWorkflowActions.resolveAndStageAllConflictsFirst")
              : t("workflows.repositoryWorkflowActions.reviewAndCommitThisMerge")
          }
          onClick={() => setMergeFor(repositoryId)}
        >
          {t("workflows.repositoryWorkflowActions.continueMerge")}
        </TextButton>
      )}
      {rebaseAction && (
        <RebaseDialog
          key={repositoryId}
          repositoryId={repositoryId}
          action={rebaseAction}
          onClose={() => setRebaseAction(null)}
        />
      )}
      {replayAction && (
        <ReplayDialog
          repositoryId={repositoryId}
          kind={replayAction.kind}
          action={replayAction.action}
          onClose={() => setReplayAction(null)}
        />
      )}
      {mergeFor === repositoryId && (
        <MergeContinueDialog
          key={repositoryId}
          repositoryId={repositoryId}
          onClose={() => setMergeFor(null)}
        />
      )}
      {abortFor === repositoryId && (
        <MergeAbortDialog
          kind={workflow?.kind === "stash" ? "stash" : "merge"}
          key={repositoryId}
          repositoryId={repositoryId}
          onClose={() => setAbortFor(null)}
        />
      )}
    </>
  );
}
