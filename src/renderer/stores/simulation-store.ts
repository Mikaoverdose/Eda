import { PACKAGE_MANAGER_NAMES } from "@shared/application";
import { t } from "@shared/i18n";
import type { UpdatePhase, UpdateState } from "@shared/updates";
import { create } from "zustand";
import { usePreferencesStore } from "./preferences-store";

export type GitIdentitySimulation = "matched" | "mismatch" | "apply-error";
export type UpdateInstallationSimulation = "direct" | keyof typeof PACKAGE_MANAGER_NAMES;

interface SimulationState {
  update: UpdateState | null;
  updateInstallation: UpdateInstallationSimulation;
  gitIdentity: GitIdentitySimulation | null;
  setUpdatePhase: (phase: UpdatePhase | null) => void;
  setUpdateInstallation: (installation: UpdateInstallationSimulation) => void;
  setDownloadProgress: (percent: number) => void;
  runUpdateAction: (action: "check" | "download" | "install") => boolean;
  setGitIdentity: (state: GitIdentitySimulation | null) => void;
  reset: () => void;
}

function updatePreview(
  requestedPhase: UpdatePhase,
  installation: UpdateInstallationSimulation,
): UpdateState {
  const managed = installation !== "direct";
  const phase =
    managed && ["downloading", "ready", "installing"].includes(requestedPhase)
      ? "available"
      : requestedPhase;
  const hasRelease = ["available", "downloading", "ready", "installing"].includes(phase);

  return {
    revision: 0,
    capability: managed ? "managed" : "automatic",
    phase,
    reason: managed
      ? t("updates.managedBy", { manager: PACKAGE_MANAGER_NAMES[installation] })
      : null,
    feedUrl: null,
    checkedAt: new Date().toISOString(),
    release: hasRelease
      ? {
          version: "0.0.3",
          name: "Eda 0.0.3",
          notes: t("settings.stateSimulations.previewReleaseNotes"),
          releasedAt: null,
        }
      : null,
    progress: phase === "downloading" ? { percent: 45 } : null,
    error: phase === "error" ? t("settings.stateSimulations.previewUpdateError") : null,
  };
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  update: null,
  updateInstallation: "direct",
  gitIdentity: null,

  setUpdatePhase(phase) {
    if (phase === null) {
      set({ update: null, updateInstallation: "direct" });

      return;
    }

    if (!usePreferencesStore.getState().values.developerSettingsEnabled.value) return;

    set({ update: updatePreview(phase, get().updateInstallation) });
  },

  setUpdateInstallation(installation) {
    const { update } = get();

    if (!update || !usePreferencesStore.getState().values.developerSettingsEnabled.value) return;

    set({
      updateInstallation: installation,
      update: updatePreview(update.phase, installation),
    });
  },

  setDownloadProgress(percent) {
    const state = get().update;

    if (state?.capability !== "automatic" || state.phase !== "downloading") return;

    set({ update: { ...state, progress: { percent: Math.max(0, Math.min(100, percent)) } } });
  },

  runUpdateAction(action) {
    const { update } = get();

    if (!update || (update.capability !== "automatic" && action !== "check")) return false;

    get().setUpdatePhase(
      action === "check" ? "current" : action === "download" ? "downloading" : "installing",
    );

    return true;
  },

  setGitIdentity(gitIdentity) {
    if (
      gitIdentity !== null &&
      !usePreferencesStore.getState().values.developerSettingsEnabled.value
    )
      return;

    set({ gitIdentity });
  },

  reset: () => set({ update: null, updateInstallation: "direct", gitIdentity: null }),
}));

usePreferencesStore.subscribe((preferences) => {
  const simulation = useSimulationStore.getState();

  if (
    !preferences.values.developerSettingsEnabled.value &&
    (simulation.update || simulation.gitIdentity)
  )
    simulation.reset();
});
