import { t } from "@shared/i18n";
import { useState } from "react";
import { Button } from "../../../components/ui/actions/Button";
import { ErrorDialog } from "../../../components/ui/overlays/ErrorDialog";

export function ResetDataSettings() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const result = await window.eda.app.debug("reset-data");
      if (!result.ok) setError(result.error.message);
    } catch {
      setError(t("settings.resetDataSettings.couldNotResetEdaPleaseTryAgain"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        {t("settings.resetDataSettings.clearEdaSDataAndReturnToOnboarding")}
      </p>
      <p className="text-sm text-text-secondary">
        {t("settings.resetDataSettings.repositoryFilesStayUntouched")}
      </p>
      <Button variant="danger" disabled={busy} onClick={() => void reset()}>
        {busy
          ? t("settings.resetDataSettings.resetting")
          : t("settings.resetDataSettings.resetAllData")}
      </Button>
      <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
    </div>
  );
}
