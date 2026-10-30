import { MAX_STASH_NAME_LENGTH, type StashInspection } from "@shared/workflows/stashes";
import { t } from "@shared/i18n";
import { useState } from "react";

import { Button, Dialog, Input, ErrorDialog } from "../../components/ui/index";

export function StashRenameDialog({
  repositoryId,
  inspection,
  onClose,
  onRenamed,
}: {
  repositoryId: string;
  inspection: StashInspection;
  onClose(): void;
  onRenamed(keptOriginal: boolean): void;
}) {
  const [name, setName] = useState(inspection.entry.message);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rename = async () => {
    setBusy(true);
    setError(null);

    try {
      const result = await window.eda.stashes.rename(repositoryId, inspection.token, name);
      if (result.ok) onRenamed(result.value.keptOriginal);
      else setError(`${result.error.message} ${result.error.suggestedAction ?? ""}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t("stashRenameDialog.renameStash")}
      description={t(
        "stashRenameDialog.saveTheSameContentsUnderANewDescriptionThenRemoveTheOldEntry",
      )}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !name.trim() || name.trim() === inspection.entry.message}
            onClick={() => void rename()}
          >
            {t("stashRenameDialog.renameStash")}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-xs">
        <label className="block">
          {t("stashRenameDialog.newDescription")}
          <Input
            aria-label={t("stashRenameDialog.newStashDescription")}
            value={name}
            maxLength={MAX_STASH_NAME_LENGTH}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <p>{t("stashRenameDialog.theRenamedStashMovesToTheTopOf")}</p>
        <p>{t("stashRenameDialog.ifRemovingTheOldEntryFailsBothEntries")}</p>
        <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      </div>
    </Dialog>
  );
}
