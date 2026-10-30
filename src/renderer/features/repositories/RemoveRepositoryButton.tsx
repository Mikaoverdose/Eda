import { t } from "@shared/i18n";
import { useState } from "react";
import { X } from "lucide-react";
import type { RepositorySummary } from "@shared/repository/repository";
import { useAppStore } from "../../stores/app-store";
import { useSessionStore } from "../../stores/session-store";
import { Button, Dialog, ErrorDialog } from "../../components/ui/index";

export function RemoveRepositoryButton({
  repository,
  compact = false,
}: {
  repository: RepositorySummary;
  compact?: boolean;
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
        setError(result.error.message);
        return;
      }

      await useAppStore.getState().refreshRepositories();
      setConfirm(false);
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
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
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
          footer={
            <>
              <Button variant="quiet" disabled={busy} onClick={() => setConfirm(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" busy={busy} onClick={() => void remove()}>
                {t("removeRepositoryButton.dialogTitle")}
              </Button>
            </>
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
