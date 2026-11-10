import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { RepositorySummary } from "@shared/repository/repository";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { DialogActions, Button, Dialog, ErrorDialog } from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";
import { useSessionStore } from "../../stores/session-store";

export function MissingRepository({ repository }: { repository: RepositorySummary }) {
  const [candidate, setCandidate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);

    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const choose = () =>
    run(async () => {
      const result = await window.eda.repository.chooseFolder();
      if (!result.ok) setError(errorMessage(result.error));
      else setCandidate(result.value);
    });

  const locate = () =>
    run(async () => {
      if (!candidate || !(await useSessionStore.getState().flush())) return;

      const result = await window.eda.repository.relocate(repository.id, candidate);

      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }

      await useAppStore.getState().refreshRepositories();
      setCandidate(null);
    });

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-[54ch] text-center">
        <h3 className="text-base font-semibold">{t("missingRepository.repositoryUnavailable")}</h3>
        <p className="mt-2 text-sm text-text-tertiary">
          {t("missingRepository.theSavedFolderIsMissingOrIsNoLongerAGitRepository")}
        </p>
        <p className="mono mt-2 break-all text-xs text-text-secondary">{repository.path}</p>
        <p className="mt-2 text-sm text-text-tertiary">
          {t("missingRepository.yourTabsAndDraftsAreSavedIfYou")}
        </p>

        <div className="mt-4 flex justify-center gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void run(() => useAppStore.getState().refreshRepositories())}
          >
            {t("missingRepository.tryAgain")}
          </Button>

          <Button disabled={busy} onClick={() => void choose()}>
            {t("missingRepository.locateRepository")}
          </Button>
        </div>

        {error && !candidate && <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>}
      </div>

      {candidate && (
        <Dialog
          title={t("missingRepository.updateRepositoryLocation")}
          busy={busy}
          onClose={() => {
            setCandidate(null);
            setError(null);
          }}
          footer={
            <DialogActions
              onClose={() => setCandidate(null)}
              onConfirm={() => void locate()}
              confirmLabel={t("missingRepository.useThisFolder")}
              busy={busy}
              confirmVariant="secondary"
            />
          }
        >
          <p className="text-sm">
            {t("missingRepository.chooseTheSameRepositoryYouMovedThisKeeps")}
          </p>

          <p className="mono my-3 break-all text-xs">
            {repository.path}

            <span className="flex items-start gap-1">
              <ArrowRight size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-all">{candidate}</span>
            </span>
          </p>

          <p className="text-xs text-text-secondary">
            {t("missingRepository.edaUpdatesThisSavedLocationWithoutMovingFiles")}
          </p>
          <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
        </Dialog>
      )}
    </div>
  );
}
