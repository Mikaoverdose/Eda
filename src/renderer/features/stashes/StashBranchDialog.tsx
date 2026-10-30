import { t } from "@shared/i18n";
import { Localized } from "@renderer/i18n/Localized";
import { useState } from "react";
import type { StashBranchPreview } from "@shared/workflows/stashes";
import { useRepositoryStore } from "../../stores/repository-store";
import { Dialog, Input, ErrorDialog, ReviewActions } from "../../components/ui/index";

export function StashBranchDialog({
  repositoryId,
  stashToken,
  onClose,
  onCreated,
}: {
  repositoryId: string;
  stashToken: string;
  onClose(): void;
  onCreated(name: string, applied: boolean): void;
}) {
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<StashBranchPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const review = async () => {
    setBusy(true);
    setError(null);
    setPreview(null);

    try {
      const result = await window.eda.stashes.prepareBranch(repositoryId, stashToken, name);
      if (result.ok) setPreview(result.value);
      else setError(result.error.message);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!preview) return;

    setBusy(true);
    setError(null);

    try {
      const result = await window.eda.stashes.createBranch(repositoryId, preview.token);

      await useRepositoryStore.getState().syncFromDisk();

      if (result.ok) onCreated(preview.name, result.value.applied);
      else {
        setError(`${result.error.message} ${result.error.suggestedAction ?? ""}`);
        setPreview(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t("stashBranchDialog.createBranchFromStash")}
      description={t("stashBranchDialog.startANewBranchAtTheStashS")}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <ReviewActions
          busy={busy}
          onClose={onClose}
          onReview={() => void review()}
          onConfirm={() => void create()}
          confirmLabel={t("stashBranchDialog.createAndRestore")}
          confirmDisabled={!preview}
          reviewLabel={t("stashBranchDialog.reviewBranch")}
          reviewDisabled={!name.trim()}
        />
      }
    >
      <div className="space-y-3 text-xs">
        <label className="block">
          {t("stashBranchDialog.newBranchName")}
          <Input
            aria-label={t("stashBranchDialog.stashBranchName")}
            value={name}
            disabled={busy}
            onChange={(event) => {
              setName(event.target.value);
              setPreview(null);
            }}
          />
        </label>
        <p>{t("stashBranchDialog.aCleanWorktreeAndIndexAreRequiredIgnored")}</p>
        {preview && (
          <>
            <p>
              <Localized
                id="stashBranchDialog.leaveAt"
                values={{
                  value1: preview.branch ?? t("stashBranchDialog.detachedHead"),
                  code2: <code>{preview.head.slice(0, 12)}</code>,
                }}
              />
            </p>
            <p>
              <Localized
                id="stashBranchDialog.createAtStashBase"
                values={{
                  strong: <strong>{preview.name}</strong>,
                  code2: <code>{preview.base.slice(0, 12)}</code>,
                }}
              />
            </p>
            <p>{t("stashBranchDialog.ifApplicationNeedsAttentionTheNewBranchAnd")}</p>
          </>
        )}
        <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      </div>
    </Dialog>
  );
}
