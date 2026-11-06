import { t } from "@shared/i18n";
import type { UpdatePhase } from "@shared/updates";
import { Button, NoticeBanner, RangeField, Select } from "../../../components/ui/index";
import { useSimulationStore, type GitIdentitySimulation } from "../../../stores/simulation-store";
import { useAppStore } from "../../../stores/app-store";
import { UpdateStatus } from "../../updates/UpdatesSettings";

export function StateSimulations() {
  const state = useSimulationStore((simulation) => simulation.update);
  const setPhase = useSimulationStore((simulation) => simulation.setUpdatePhase);
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
    <div className="max-w-2xl space-y-6">
      {(state || gitIdentity) && (
        <Button onClick={() => useSimulationStore.getState().reset()}>
          {t("settings.stateSimulations.resetAll")}
        </Button>
      )}

      <section aria-labelledby="update-simulation-heading" className="space-y-4">
        <h2 id="update-simulation-heading" className="text-sm font-medium">
          {t("settings.stateSimulations.appUpdates")}
        </h2>

        <p className="text-sm text-text-secondary">{t("settings.stateSimulations.description")}</p>

        <label className="block space-y-2 text-sm">
          {t("settings.stateSimulations.updateState")}

          <Select
            aria-label={t("settings.stateSimulations.updateState")}
            className="w-full"
            value={state?.phase ?? "live"}
            onValueChange={(value) => setPhase(value === "live" ? null : (value as UpdatePhase))}
          >
            <option value="live">{t("settings.stateSimulations.useLiveStatus")}</option>

            {phases.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>

        {state && (
          <div className="space-y-4 rounded-md border border-border-subtle bg-bg-surface p-4">
            <UpdateStatus
              state={state}
              actions={{
                check: async () => useSimulationStore.getState().runUpdateAction("check"),
                download: async () => useSimulationStore.getState().runUpdateAction("download"),
                install: async () => useSimulationStore.getState().runUpdateAction("install"),
              }}
            />

            {state.phase === "downloading" && (
              <div className="space-y-3">
                <RangeField
                  label={t("settings.stateSimulations.downloadProgress")}
                  value={state.progress?.percent ?? 0}
                  onPreview={(percent) =>
                    useSimulationStore.getState().setDownloadProgress(percent)
                  }
                  onCommit={(percent) => useSimulationStore.getState().setDownloadProgress(percent)}
                />

                <Button onClick={() => setPhase("ready")}>
                  {t("settings.componentPreviews.previewCompletedDownload")}
                </Button>
              </div>
            )}

            <Button onClick={() => setPhase(null)}>
              {t("settings.stateSimulations.resetPreview")}
            </Button>
          </div>
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
          <div className="space-y-4 rounded-md border border-border-subtle bg-bg-surface p-4">
            {gitIdentity === "matched" ? (
              <NoticeBanner>{t("settings.stateSimulations.identityMatches")}</NoticeBanner>
            ) : (
              <p role="status" className="text-sm text-text-secondary">
                {t("settings.stateSimulations.gitWarningInTopBar")}
              </p>
            )}

            <Button onClick={() => setGitIdentity(null)}>
              {t("settings.stateSimulations.resetPreview")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
