import { Localized } from "@renderer/i18n/Localized";
import { t } from "@shared/i18n";
import type { MergeMode } from "@shared/workflows/workflow";
import { useCallback, useState } from "react";
import { Dialog, ErrorDialog, ReviewActions, Select } from "../../components/ui/index";
import { useReviewedOperation } from "../../repository/hooks/useReviewedOperation";

export function MergeStartDialog({
  repositoryId,
  source,
  onClose,
}: {
  repositoryId: string;
  source: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<MergeMode>("ff");

  const prepare = useCallback(
    () => window.eda.workflows.prepareStart(repositoryId, source, mode),
    [repositoryId, source, mode],
  );

  const { preview, setPreview, busy, error, setError, review, execute } = useReviewedOperation(
    repositoryId,
    prepare,
  );

  const start = () =>
    execute((preview) => window.eda.workflows.startMerge(repositoryId, preview.token), onClose);

  return (
    <Dialog
      title={t("mergeStartDialog.mergeIntoCurrentBranch")}
      description={t("mergeStartDialog.reviewTheExactSourceCommitAndTargetBranch")}
      busy={busy}
      onClose={onClose}
      footer={
        <ReviewActions
          busy={busy}
          onClose={onClose}
          onReview={() => void review()}
          onConfirm={() => void start()}
          confirmLabel={t("mergeStartDialog.startMerge")}
          confirmDisabled={!preview || preview.upToDate}
        />
      }
    >
      <div className="space-y-3 text-xs">
        <label className="block">
          {t("mergeStartDialog.mergePolicy")}

          <Select
            aria-label={t("mergeStartDialog.mergePolicy")}
            value={mode}
            disabled={busy}
            onValueChange={(value) => {
              setPreview(null);
              setMode(value as MergeMode);
            }}
            className="mt-1 w-full"
          >
            <option value="ff">{t("mergeStartDialog.fastForwardWhenPossible")}</option>
            <option value="no-ff">{t("mergeStartDialog.alwaysCreateAMergeCommit")}</option>
            <option value="ff-only">{t("mergeStartDialog.fastForwardOnly")}</option>
            <option value="squash">{t("mergeStartDialog.squashIntoOneOrdinaryCommit")}</option>
          </Select>
        </label>

        <p className="break-all">
          <Localized id="mergeStartDialog.sourceCommit" values={{ code: <code>{source}</code> }} />
        </p>

        {preview && (
          <>
            <p>
              <Localized
                id="mergeStartDialog.intoAt"
                values={{
                  strong: <strong>{preview.branch}</strong>,
                  code2: <code>{preview.head.slice(0, 12)}</code>,
                }}
              />
            </p>

            <div
              className="space-y-2 rounded border border-border-subtle p-3"
              aria-label={t("mergeStartDialog.mergePrediction")}
            >
              <p>
                {preview.prediction.state === "clean"
                  ? t("mergeStartDialog.gitPredictsAMergeWithoutConflicts")
                  : preview.prediction.state === "conflicted"
                    ? t(
                        "mergeStartDialog.gitPredictsConflictsYouCanStartTheMergeAndResolveThemInEda",
                      )
                    : t("mergeStartDialog.gitCouldNotPredictWhetherThisMergeWillHaveConflicts")}
              </p>

              {preview.prediction.reason && <p>{preview.prediction.reason}</p>}

              {!!preview.prediction.paths.length && (
                <ul className="max-h-36 list-inside list-disc overflow-auto font-mono">
                  {preview.prediction.paths.map((path) => (
                    <li key={path} className="break-all">
                      {path}
                    </li>
                  ))}
                </ul>
              )}

              {preview.prediction.totalPaths > preview.prediction.paths.length && (
                <p>
                  {t("mergeStartDialog.showingOfConflictedPaths", {
                    length: preview.prediction.paths.length,
                    totalPaths: preview.prediction.totalPaths,
                  })}
                </p>
              )}

              <p className="text-text-tertiary">
                {t("mergeStartDialog.predictionForTheReviewedCommitsYourIndexAnd")}
              </p>
            </div>

            <p>
              {preview.upToDate
                ? t("mergeStartDialog.theTargetAlreadyContainsThisCommit")
                : mode === "squash"
                  ? t("mergeStartDialog.gitWillPrepareTheCombinedChangesWithoutA")
                  : preview.fastForward && mode !== "no-ff"
                    ? t(
                        "mergeStartDialog.theBranchWillMoveDirectlyToTheSourceCommitNoMergeCommitIsNeeded",
                      )
                    : t("mergeStartDialog.gitWillPrepareTheMergeWithoutCommittingResolve")}
            </p>
          </>
        )}

        <p className="text-text-tertiary">
          {t("mergeStartDialog.aCleanWorkingTreeAndIndexAreRequired")}
        </p>
        <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      </div>
    </Dialog>
  );
}
