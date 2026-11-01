import { Localized } from "@renderer/i18n/Localized";
import { errorMessage } from "@shared/errors";
import { getLocale, t } from "@shared/i18n";
import type { RebaseAction, RebasePlanEntry, RebaseReview } from "@shared/workflows/rebase";
import { useEffect, useState } from "react";
import { Checkbox, Dialog, ErrorDialog, ReviewActions, Textarea } from "../../components/ui/index";
import { useRepositoryStore } from "../../stores/repository-store";
import { RebasePlanEditor } from "./RebasePlanEditor";

const labels: Record<RebaseAction, string> = {
  start: t("rebaseDialog.rebaseCurrentBranch"),
  continue: t("rebaseDialog.continueRebase"),
  skip: t("rebaseDialog.skipCurrentCommit"),
  abort: t("rebaseDialog.abortRebase"),
  amend: t("rebaseDialog.amendPausedCommit"),
};

export function RebaseDialog({
  repositoryId,
  action,
  onto,
  onClose,
}: {
  repositoryId: string;
  action: RebaseAction;
  onto?: string;
  onClose: () => void;
}) {
  const [review, setReview] = useState<RebaseReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interactive, setInteractive] = useState(false);
  const [plan, setPlan] = useState<RebasePlanEntry[] | undefined>();
  const [message, setMessage] = useState("");
  const [rewritten, setRewritten] = useState(0);
  const [recoveryWarning, setRecoveryWarning] = useState<string | null>(null);
  const prepare = async () => {
    setBusy(true);
    setReview(null);
    setPlan(undefined);
    setError(null);
    setConfirmed(false);

    try {
      const result = await window.eda.rebase.prepare(repositoryId, action, onto, interactive);
      if (result.ok) {
        setReview(result.value);
        setPlan(result.value.plan);
        setMessage(result.value.message ?? "");
      } else setError(errorMessage(result.error));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void prepare();
  }, [repositoryId, action, onto, interactive]);

  const execute = async () => {
    if (!review) return;

    setBusy(true);
    setError(null);

    try {
      const result = await window.eda.rebase.execute(
        repositoryId,
        review.token,
        plan,
        action === "amend" ? message : undefined,
      );

      await useRepositoryStore.getState().syncFromDisk();

      if (!result.ok) {
        setError(errorMessage(result.error));
        setConfirmed(false);
        return;
      }

      if (result.value.state === "completed" && result.value.publishedCommits)
        setRewritten(result.value.publishedCommits);
      if (result.value.recoveryWarning) setRecoveryWarning(result.value.recoveryWarning);
      else if (!result.value.publishedCommits) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      wide={interactive}
      title={labels[action]}
      onClose={() => {
        if (!busy) onClose();
      }}
      description={
        action === "start"
          ? t("rebaseDialog.replayTheCurrentBranchSCommitsOnThe")
          : action === "skip"
            ? t("rebaseDialog.discardTheCurrentReplayedCommitAndItsResolution")
            : action === "abort"
              ? t("rebaseDialog.returnToTheBranchStateBeforeTheRebase")
              : action === "amend"
                ? t("rebaseDialog.replaceThePausedCommitWithTheStagedChanges")
                : t("rebaseDialog.commitTheStagedResolutionAndResumeTheRemaining")
      }
      footer={
        <ReviewActions
          busy={busy}
          onClose={onClose}
          onReview={() => void prepare()}
          onConfirm={() => void execute()}
          confirmLabel={labels[action]}
          confirmDisabled={!review || !confirmed || rewritten > 0 || !!recoveryWarning}
          confirmVariant="secondary"
          closeLabel={rewritten || recoveryWarning ? t("common.close") : t("common.cancel")}
          closeVariant="secondary"
          reviewDisabled={rewritten > 0 || !!recoveryWarning}
        />
      }
    >
      <div className="space-y-3 text-xs">
        {recoveryWarning && <p role="status">{recoveryWarning}</p>}
        {rewritten > 0 && (
          <p role="status">
            {t("rebaseDialog.rebaseCompletedTheOriginalRangeIncludedPublishedCommits", {
              rewritten: rewritten,
            })}
          </p>
        )}
        {action === "start" && !rewritten && (
          <Checkbox
            checked={interactive}
            disabled={busy}
            onChange={(event) => setInteractive(event.target.checked)}
          >
            {t("rebaseDialog.editCommitOrderAndMessages")}
          </Checkbox>
        )}
        {review && !rewritten && (
          <>
            {review.publishedCommits > 0 && !rewritten && (
              <p role="note">
                {t("rebaseDialog.thisRangeIncludesCommitsReachableFromLocallyKnown", {
                  publishedCommits: review.publishedCommits,
                })}
              </p>
            )}
            <p>
              <Localized
                id="rebaseDialog.originalHead"
                values={{ code: <code>{review.head}</code> }}
              />
            </p>
            {review.branch && (
              <p>
                <Localized
                  id="rebaseDialog.originalBranch"
                  values={{ code: <code>{review.branch}</code> }}
                />
              </p>
            )}
            {review.onto && (
              <p>
                <Localized
                  id="rebaseDialog.newBase"
                  values={{ code: <code>{review.onto}</code> }}
                />
              </p>
            )}
            <p>
              {t("rebaseDialog.committerDetails", { author: review.author, email: review.email })}
            </p>
            {action === "amend" && (
              <p>
                {t("rebaseDialog.stagedPathsIncluded", {
                  value1: review.paths.length
                    ? review.paths.join(", ")
                    : t("rebaseDialog.noneMessageOnlyAmendment"),
                })}
              </p>
            )}
            {action === "amend" && (
              <Textarea
                aria-label={t("rebaseDialog.pausedCommitMessage")}
                rows={5}
                value={message}
                disabled={busy}
                surface="surface"
                onChange={(event) => {
                  setMessage(event.target.value);
                  setConfirmed(false);
                }}
              />
            )}
            {plan && (
              <RebasePlanEditor
                original={review.plan!}
                plan={plan}
                disabled={busy}
                onChange={(next) => {
                  setPlan(next);
                  setConfirmed(false);
                }}
              />
            )}
            {(action === "abort" || action === "skip") && (
              <>
                <p>
                  {t("rebaseDialog.recoveryWillPreserveAffectedPathsBytesBeforeChanging", {
                    length: review.paths.length,
                    recoveryBytes: review.recoveryBytes.toLocaleString(getLocale()),
                  })}
                </p>
                <ul className="max-h-40 overflow-auto font-mono">
                  {review.paths.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              </>
            )}
            <Checkbox
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            >
              {t("rebaseDialog.iReviewedThisRebaseAction")}
            </Checkbox>
          </>
        )}
        <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      </div>
    </Dialog>
  );
}
