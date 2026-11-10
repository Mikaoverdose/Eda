import { getLocale, t } from "@shared/i18n";
import type { StashArea } from "@shared/workflows/stashes";
import { useCallback } from "react";
import { Dialog, ErrorDialog, ReviewActions } from "../../components/ui/index";
import { useReviewedOperation } from "../../repository/hooks/useReviewedOperation";

export function StashFileRestoreDialog({
  repositoryId,
  stashToken,
  area,
  path,
  onClose,
  onRestored,
}: {
  repositoryId: string;
  stashToken: string;
  area: StashArea;
  path: string;
  onClose(): void;
  onRestored(): void;
}) {
  const prepare = useCallback(
    () => window.eda.stashes.prepareFile(repositoryId, stashToken, area, path),
    [repositoryId, stashToken, area, path],
  );

  const { preview, busy, error, setError, review, execute } = useReviewedOperation(
    repositoryId,
    prepare,
  );

  const restore = () =>
    execute((preview) => window.eda.stashes.restoreFile(repositoryId, preview.token), onRestored);

  return (
    <Dialog
      title={t("stashFileRestoreDialog.restoreStashFile")}
      description={t("stashFileRestoreDialog.replaceOnlyThisWorkingPathWithTheSelected")}
      busy={busy}
      onClose={onClose}
      footer={
        <ReviewActions
          busy={busy}
          onClose={onClose}
          onReview={() => void review()}
          onConfirm={() => void restore()}
          confirmLabel={
            preview?.deleted
              ? t("stashFileRestoreDialog.restoreSavedDeletion")
              : t("stashFileRestoreDialog.restoreWorkingFile")
          }
          confirmDisabled={!preview}
        />
      }
    >
      <div className="space-y-3 text-xs">
        <p className="break-all">
          <strong>{path}</strong>
        </p>

        <p>
          {t("stashFileRestoreDialog.version", {
            value1:
              area === "staged"
                ? t("stashFileRestoreDialog.stagedAtStashTime")
                : area === "untracked"
                  ? t("stashFileRestoreDialog.untrackedIgnoredAtStashTime")
                  : t("stashFileRestoreDialog.workingFileAtStashTime"),
          })}
        </p>

        {preview && (
          <>
            <p>
              {preview.deleted
                ? t("stashFileRestoreDialog.thisPathWasDeletedInTheSelectedVersion")
                : t(
                    "stashFileRestoreDialog.theCurrentWorkingFileWillBeReplacedWithTheSavedVersionBytes",
                    { savedBytes: preview.savedBytes.toLocaleString(getLocale()) },
                  )}
            </p>

            <p>
              {t("stashFileRestoreDialog.beforeChangingTheFileEdaWillSaveA", {
                recoveryBytes: preview.recoveryBytes.toLocaleString(getLocale()),
              })}
            </p>
          </>
        )}

        <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      </div>
    </Dialog>
  );
}
