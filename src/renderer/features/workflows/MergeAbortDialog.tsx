import { t, getLocale } from "@shared/i18n";
import { Localized } from "@renderer/i18n/Localized";
import { useEffect, useRef, useState } from "react";
import type { MergeAbortPreview } from "@shared/workflows/workflow";
import { useRepositoryStore } from "../../stores/repository-store";
import { Dialog, Checkbox, ErrorDialog, ReviewActions } from "../../components/ui/index";

export function MergeAbortDialog({
  repositoryId,
  kind = "merge",
  onClose,
}: {
  repositoryId: string;
  kind?: "merge" | "stash";
  onClose: () => void;
}) {
  const label =
    kind === "stash" ? t("mergeAbortDialog.stashApplication") : t("mergeAbortDialog.merge");
  const [preview, setPreview] = useState<MergeAbortPreview | null>(null);
  const request = useRef(0);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const review = async () => {
    const generation = ++request.current;
    setBusy(true);
    setError(null);
    setConfirmed(false);
    setPreview(null);

    try {
      const result = await window.eda.workflows.prepareAbort(repositoryId);
      if (generation !== request.current) return;
      if (result.ok) setPreview(result.value);
      else setError(result.error.message);
    } catch (error) {
      if (generation === request.current) setError(String(error));
    } finally {
      if (generation === request.current) setBusy(false);
    }
  };

  useEffect(() => {
    void review();
    return () => {
      request.current += 1;
    };
  }, [repositoryId, kind]);

  const abort = async () => {
    if (!preview) return;

    const generation = request.current;

    setBusy(true);
    setError(null);

    try {
      const result = await window.eda.workflows.abortMerge(repositoryId, preview.token);

      if (generation !== request.current) return;
      if (useRepositoryStore.getState().repositoryId === repositoryId)
        await useRepositoryStore.getState().syncFromDisk();
      if (generation !== request.current) return;

      if (!result.ok) {
        setError(result.error.message);
        setConfirmed(false);
        return;
      }

      onClose();
    } catch (error) {
      if (generation === request.current) setError(String(error));
    } finally {
      if (generation === request.current) setBusy(false);
    }
  };

  return (
    <Dialog
      title={t("mergeAbortDialog.abort", { label: label })}
      description={t("mergeAbortDialog.gitWillTryToRestoreTheStateBefore", {
        label: label,
        value2: kind === "stash" ? t("mergeAbortDialog.theSourceStashIsRetained") : "",
      })}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <ReviewActions
          busy={busy}
          onClose={onClose}
          onReview={() => void review()}
          onConfirm={() => void abort()}
          confirmLabel={t("mergeAbortDialog.abort", { label: label })}
          confirmDisabled={!preview || !confirmed}
          confirmVariant="secondary"
        />
      }
    >
      <div className="space-y-3 text-xs">
        {preview && (
          <>
            <p>
              <Localized
                id="mergeAbortDialog.originalHead"
                values={{ code: <code>{preview.originalHead.slice(0, 12)}</code> }}
              />
            </p>
            <p>
              {t("mergeAbortDialog.aRecoveryCopyOfBytesWillPreserveThe", {
                bytes: preview.bytes.toLocaleString(getLocale()),
              })}
            </p>
            <p>{t("mergeAbortDialog.completedSnapshotsAreRetainedFor30DaysUpTo100")}</p>
            <ul className="max-h-48 overflow-auto font-mono">
              {preview.paths.map((path) => (
                <li key={path}>{path}</li>
              ))}
            </ul>
            <Checkbox
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={busy}
            >
              {t("mergeAbortDialog.abortThisAndPreserveRecoveryCopies", { label: label })}
            </Checkbox>
          </>
        )}
        <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      </div>
    </Dialog>
  );
}
