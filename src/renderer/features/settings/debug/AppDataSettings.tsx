import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { useState } from "react";
import { Button } from "../../../components/ui/actions/Button";
import { ErrorDialog } from "../../../components/ui/overlays/ErrorDialog";

export function AppDataSettings() {
  const [busy, setBusy] = useState<"reset-data" | "import-release-data" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "reset-data" | "import-release-data") {
    setBusy(action);
    setError(null);
    try {
      const result = await window.eda.app.debug(action);
      if (!result.ok) setError(errorMessage(result.error));
    } catch {
      setError(t("settings.appData.failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {import.meta.env.DEV && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-text-primary">
            {t("settings.appData.importTitle")}
          </h3>
          <p className="text-sm text-text-secondary">{t("settings.appData.importDescription")}</p>
          <Button
            busy={busy === "import-release-data"}
            disabled={busy !== null}
            onClick={() => void run("import-release-data")}
          >
            {t("settings.appData.importAction")}
          </Button>
        </div>
      )}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-text-primary">
          {t("settings.appData.resetTitle")}
        </h3>
        <p className="text-sm text-text-secondary">
          {t("settings.resetDataSettings.clearEdaSDataAndReturnToOnboarding")}
        </p>
        <p className="text-sm text-text-secondary">
          {t("settings.resetDataSettings.repositoryFilesStayUntouched")}
        </p>
        <Button variant="danger" disabled={busy !== null} onClick={() => void run("reset-data")}>
          {busy === "reset-data"
            ? t("settings.resetDataSettings.resetting")
            : t("settings.resetDataSettings.resetAllData")}
        </Button>
      </div>
      <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
    </div>
  );
}
