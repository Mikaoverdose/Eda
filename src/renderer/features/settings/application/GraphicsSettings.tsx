import type { GraphicsStatus } from "@shared/application";
import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { useEffect, useState } from "react";
import { Checkbox, ErrorDialog, NoticeBanner } from "../../../components/ui/index";
import { usePreferencesStore } from "../../../stores/preferences-store";
import { useScopedSetting } from "../hooks/useScopedSetting";

export function GraphicsSettings() {
  const setting = useScopedSetting("hardwareAcceleration", "application");
  const saving = usePreferencesStore((state) => state.saving);
  const [status, setStatus] = useState<GraphicsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const refresh = async () => {
      try {
        const result = await window.eda.app.graphicsStatus();

        if (cancelled) return;

        if (!result.ok) {
          setError(errorMessage(result.error));
          return;
        }

        setStatus(result.value);

        if (result.value.compositing === "pending" && ++attempts < 5)
          timer = setTimeout(() => void refresh(), 1000);
      } catch {
        if (!cancelled) setError(t("settings.graphicsSettings.couldNotReadGraphicsStatus"));
      }
    };

    void refresh();
    window.addEventListener("focus", refresh);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const pendingRestart =
    status && !setting.reading && setting.resolved.value !== status.enabledAtStartup;

  return (
    <div className="space-y-3 border-t border-border-subtle pt-5">
      <div>
        <h2 className="text-sm font-medium">{t("settings.graphicsSettings.graphics")}</h2>
        <p className="mt-2 text-xs text-text-secondary">
          {t("settings.graphicsSettings.useYourGpuWhenSupportedAppliesToAllProfiles")}
        </p>
      </div>
      <Checkbox
        checked={setting.resolved.value}
        disabled={setting.reading}
        aria-busy={saving}
        onChange={(event) => void setting.set(event.currentTarget.checked)}
      >
        {t("settings.graphicsSettings.useHardwareAccelerationWhenAvailable")}
      </Checkbox>
      <p role="status" className="text-xs text-text-tertiary">
        {status?.compositing === "hardware"
          ? t("settings.graphicsSettings.gpuCompositingIsActive")
          : status?.compositing === "software"
            ? status.enabledAtStartup
              ? t(
                  "settings.graphicsSettings.softwareRenderingIsActiveHardwareAccelerationIsUnavailable",
                )
              : t("settings.graphicsSettings.hardwareAccelerationIsTurnedOffForThisSession")
            : t("settings.graphicsSettings.gpuStatusIsNotAvailableYet")}
      </p>
      {pendingRestart && (
        <NoticeBanner>{t("settings.graphicsSettings.restartEdaToApplyThisChange")}</NoticeBanner>
      )}
      <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
    </div>
  );
}
