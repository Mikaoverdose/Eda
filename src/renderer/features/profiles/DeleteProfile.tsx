import { t } from "@shared/i18n";
import { ErrorDialog } from "../../components/ui/index";
import { useState } from "react";
import type { ProfileDeletePreview } from "@shared/identity/profile-session";
import { useAppStore } from "../../stores/app-store";
import { Button, Dialog, TextButton } from "../../components/ui/index";

export function DeleteProfile({
  preview,
  onClose,
  onRefresh,
}: {
  preview: ProfileDeletePreview;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);

    try {
      if (await useAppStore.getState().deleteIdentity(preview.profileId, preview.token)) onClose();
      else
        setError(
          t("profiles.deleteProfile.deletionWasNotCompletedReviewTheLatestPreviewAndTryAgain"),
        );
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t("profiles.deleteProfile.delete", { name: preview.name })}
      onClose={() => {
        if (!busy) onClose();
      }}
      description={t(
        "profiles.deleteProfile.deleteThisProfileSSavedMetadataAndRememberedCredentials",
      )}
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" disabled={busy} busy={busy} onClick={() => void remove()}>
            {t("profiles.deleteProfile.deleteProfile")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p>
          {t("profiles.deleteProfile.repositoryMembershipsAndSavedDraftRecordsWillBe", {
            repositories: preview.repositories,
            drafts: preview.drafts,
          })}
        </p>
        <p>
          {t("profiles.deleteProfile.repositoryFoldersGitHistoryWorkingFilesAndSshKeyFilesAreKept")}
        </p>
        <p>
          {preview.active
            ? preview.fallback
              ? t("profiles.deleteProfile.edaWillSwitchToItsGlobalGitSyncPreferenceApplies", {
                  name: preview.fallback.name,
                })
              : t("profiles.deleteProfile.thisIsTheLastProfileEdaWillReturn")
            : t("profiles.deleteProfile.yourActiveProfileStaysSelected")}
        </p>
        {error && (
          <ErrorDialog>
            {error}{" "}
            <TextButton onClick={onRefresh}>
              {t("profiles.deleteProfile.refreshPreview")}
            </TextButton>
          </ErrorDialog>
        )}
      </div>
    </Dialog>
  );
}
