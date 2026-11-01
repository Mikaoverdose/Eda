import { errorMessage } from "@shared/errors";
import { getLocale, t } from "@shared/i18n";
import type { StashArea, StashFilePreview } from "@shared/workflows/stashes";
import { useEffect, useRef, useState } from "react";
import { Dialog, ErrorDialog, ReviewActions } from "../../components/ui/index";
import { useRepositoryStore } from "../../stores/repository-store";

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
  const [preview, setPreview] = useState<StashFilePreview | null>(null);
  const request = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const review = async () => {
    const generation = ++request.current;
    setBusy(true);
    setError(null);
    setPreview(null);

    try {
      const result = await window.eda.stashes.prepareFile(repositoryId, stashToken, area, path);
      if (generation !== request.current) return;
      if (result.ok) setPreview(result.value);
      else setError(errorMessage(result.error));
    } catch (error) {
      if (generation === request.current) setError(errorMessage(error));
    } finally {
      if (generation === request.current) setBusy(false);
    }
  };

  useEffect(() => {
    void review();
    return () => {
      request.current += 1;
    };
  }, [repositoryId, stashToken, area, path]);

  const restore = async () => {
    if (!preview) return;

    const generation = request.current;

    setBusy(true);
    setError(null);

    try {
      const result = await window.eda.stashes.restoreFile(repositoryId, preview.token);

      if (generation !== request.current) return;
      if (useRepositoryStore.getState().repositoryId === repositoryId)
        await useRepositoryStore.getState().syncFromDisk();
      if (generation !== request.current) return;

      if (result.ok) onRestored();
      else {
        setError(errorMessage(result.error));
        setPreview(null);
      }
    } catch (error) {
      if (generation === request.current) setError(errorMessage(error));
    } finally {
      if (generation === request.current) setBusy(false);
    }
  };

  return (
    <Dialog
      title={t("stashFileRestoreDialog.restoreStashFile")}
      description={t("stashFileRestoreDialog.replaceOnlyThisWorkingPathWithTheSelected")}
      onClose={() => {
        if (!busy) onClose();
      }}
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
