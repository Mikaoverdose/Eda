import { PACKAGE_MANAGER_NAMES } from "@shared/application";
import { t } from "@shared/i18n";
import type { UpdatePhase } from "@shared/updates";
import { Button, RangeField, Select } from "../../../components/ui/index";
import { openSettings } from "../../../stores/shell-store";
import {
  useSimulationStore,
  type GitIdentitySimulation,
  type UpdateInstallationSimulation,
} from "../../../stores/simulation-store";
import { useAppStore } from "../../../stores/app-store";

export function StateSimulations() {
  const state = useSimulationStore((simulation) => simulation.update);
  const setPhase = useSimulationStore((simulation) => simulation.setUpdatePhase);
  const installation = useSimulationStore((simulation) => simulation.updateInstallation);
  const setInstallation = useSimulationStore((simulation) => simulation.setUpdateInstallation);
  const gitIdentity = useSimulationStore((simulation) => simulation.gitIdentity);
  const setGitIdentity = useSimulationStore((simulation) => simulation.setGitIdentity);
  const profile = useAppStore((state) => state.activeIdentity);

  const phases: { value: UpdatePhase; label: string }[] = [
    { value: "idle", label: t("settings.stateSimulations.idle") },
    { value: "checking", label: t("settings.updatesSettings.checkingForUpdates") },
    { value: "current", label: t("settings.updatesSettings.youReUpToDate") },
    { value: "available", label: t("settings.stateSimulations.updateAvailable") },
    { value: "downloading", label: t("settings.stateSimulations.downloading") },
    { value: "ready", label: t("settings.stateSimulations.readyToInstall") },
    { value: "installing", label: t("settings.stateSimulations.installing") },
    { value: "error", label: t("settings.updatesSettings.updateCheckFailed") },
  ];

  return (
    <div className="space-y-6">
      <section aria-labelledby="update-simulation-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="update-simulation-heading" className="text-sm font-medium">
            {t("settings.stateSimulations.appUpdates")}
          </h2>

          {(state || gitIdentity) && (
            <Button size="sm" variant="quiet" onClick={() => useSimulationStore.getState().reset()}>
              {t("settings.stateSimulations.resetAll")}
            </Button>
          )}
        </div>

        <p className="text-sm text-text-secondary">{t("settings.stateSimulations.description")}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 text-sm">
            {t("settings.stateSimulations.updateState")}

            <Select
              aria-label={t("settings.stateSimulations.updateState")}
              className="w-full"
              value={state?.phase ?? "live"}
              onValueChange={(value) => setPhase(value === "live" ? null : (value as UpdatePhase))}
            >
              <option value="live">{t("settings.stateSimulations.useLiveStatus")}</option>

              {phases
                .filter(
                  ({ value }) =>
                    installation === "direct" ||
                    (installation === "homebrew" && value === "installing") ||
                    !["downloading", "ready", "installing"].includes(value),
                )
                .map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </Select>
          </label>

          <label className="block space-y-2 text-sm">
            {t("settings.stateSimulations.installationMethod")}

            <Select
              aria-label={t("settings.stateSimulations.installationMethod")}
              className="w-full"
              disabled={!state}
              value={installation}
              onValueChange={(value) => setInstallation(value as UpdateInstallationSimulation)}
            >
              <option value="direct">{t("settings.aboutSettings.installationDirect")}</option>

              {Object.entries(PACKAGE_MANAGER_NAMES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {state?.phase === "downloading" && (
          <div className="space-y-3">
            <RangeField
              label={t("settings.stateSimulations.downloadProgress")}
              value={state.progress?.percent ?? 0}
              onPreview={(percent) => useSimulationStore.getState().setDownloadProgress(percent)}
              onCommit={(percent) => useSimulationStore.getState().setDownloadProgress(percent)}
            />

            <Button size="sm" onClick={() => setPhase("ready")}>
              {t("settings.componentPreviews.previewCompletedDownload")}
            </Button>
          </div>
        )}

        {state && (
          <Button size="sm" variant="secondary" onClick={() => openSettings("about")}>
            {t("appUpdateNotice.viewUpdate")}
          </Button>
        )}
      </section>

      <section
        aria-labelledby="git-identity-simulation-heading"
        className="space-y-4 border-t border-border-subtle pt-6"
      >
        <h2 id="git-identity-simulation-heading" className="text-sm font-medium">
          {t("settings.stateSimulations.gitIdentity")}
        </h2>

        <p className="text-sm text-text-secondary">
          {t("settings.stateSimulations.gitDescription")}
        </p>

        <label className="block space-y-2 text-sm">
          {t("settings.stateSimulations.gitIdentityState")}

          <Select
            aria-label={t("settings.stateSimulations.gitIdentityState")}
            disabled={!profile}
            className="w-full"
            value={gitIdentity ?? "live"}
            onValueChange={(value) =>
              setGitIdentity(value === "live" ? null : (value as GitIdentitySimulation))
            }
          >
            <option value="live">{t("settings.stateSimulations.useLiveStatus")}</option>
            <option value="matched">{t("settings.stateSimulations.identityMatches")}</option>
            <option value="mismatch">{t("settings.stateSimulations.identityMismatch")}</option>
            <option value="apply-error">{t("settings.stateSimulations.repairFails")}</option>
          </Select>
        </label>

        {!profile && (
          <p className="text-xs text-text-tertiary">
            {t("settings.stateSimulations.chooseProfile")}
          </p>
        )}

        {gitIdentity && (
          <p role="status" className="text-sm text-text-secondary">
            {t(
              gitIdentity === "matched"
                ? "settings.stateSimulations.identityMatches"
                : "settings.stateSimulations.gitWarningInTopBar",
            )}
          </p>
        )}
      </section>
    </div>
  );
}
