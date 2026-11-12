import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { RepositorySummary } from "@shared/repository/repository";
import { CloseIcon as X } from "../../components/ui/icons";
import { useState } from "react";
import { DialogActions, Button, Dialog, ErrorDialog } from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";
import { useSessionStore } from "../../stores/session-store";

export function RemoveRepositoryButton({
  repository,
  compact = false,
  disabled = false,
}: {
  repository: RepositorySummary;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [profileId, setProfileId] = useState<string | undefined>(undefined);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);

    try {
      if (!(await useSessionStore.getState().flush())) {
        setError(
          useSessionStore.getState().error ??
            t("removeRepositoryButton.couldNotSaveTheCurrentSessionTryAgain"),
        );

        return;
      }

      if (useAppStore.getState().activeIdentity?.id !== profileId) {
        setError(t("removeRepositoryButton.theActiveProfileChangedCloseThisDialogAndTryAgain"));
        return;
      }

      const result = await window.eda.repository.remove(repository.id);

      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }

      await useAppStore.getState().refreshRepositories();
      setConfirm(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        disabled={disabled}
        variant="quiet"
        size={compact ? "icon-sm" : "sm"}
        aria-label={t("removeRepositoryButton.removeFromProfile", { name: repository.name })}
        title={t("removeRepositoryButton.dialogTitle")}
        onClick={() => {
          setProfileId(useAppStore.getState().activeIdentity?.id);
          setConfirm(true);
        }}
      >
        {compact ? <X size={14} aria-hidden="true" /> : t("removeRepositoryButton.openDialog")}
      </Button>

      {confirm && (
        <Dialog
          title={t("removeRepositoryButton.removeRepositoryFromProfile")}
          busy={busy}
          onClose={() => setConfirm(false)}
          footer={
            <DialogActions
              onClose={() => setConfirm(false)}
              onConfirm={() => void remove()}
              confirmLabel={t("removeRepositoryButton.dialogTitle")}
              busy={busy}
              confirmVariant="danger"
            />
          }
        >
          <p>
            {t("removeRepositoryButton.removeFromThisProfileSRepositoryListIncluding", {
              name: repository.name,
            })}
          </p>

          <p className="mono my-3 break-all text-xs">{repository.path}</p>
          <p>
            {t("removeRepositoryButton.filesOnDiskGitHistoryAndOtherProfilesMembershipsAreKept")}
          </p>
          <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
        </Dialog>
      )}
    </>
  );
}
