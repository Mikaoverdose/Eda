import { t } from "@shared/i18n";
import type { UpdatePhase, UpdateState } from "@shared/updates";
import { create } from "zustand";
import { usePreferencesStore } from "./preferences-store";

export type GitIdentitySimulation = "matched" | "mismatch" | "apply-error";

interface SimulationState {
  update: UpdateState | null;
  gitIdentity: GitIdentitySimulation | null;
  setUpdatePhase: (phase: UpdatePhase | null) => void;
  setDownloadProgress: (percent: number) => void;
  runUpdateAction: (action: "check" | "download" | "install") => boolean;
  setGitIdentity: (state: GitIdentitySimulation | null) => void;
  reset: () => void;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  update: null,
  gitIdentity: null,

  setUpdatePhase(phase) {
    if (phase === null) {
      set({ update: null });

      return;
    }

    if (!usePreferencesStore.getState().values.developerSettingsEnabled.value) return;

    const hasRelease = ["available", "downloading", "ready", "installing"].includes(phase);

    set({
      update: {
        revision: 0,
        capability: "automatic",
        phase,
        reason: null,
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
      },
    });
  },

  setDownloadProgress(percent) {
    const state = get().update;

    if (state?.phase !== "downloading") return;

    set({ update: { ...state, progress: { percent: Math.max(0, Math.min(100, percent)) } } });
  },

  runUpdateAction(action) {
    if (!get().update) return false;

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

  reset: () => set({ update: null, gitIdentity: null }),
}));

usePreferencesStore.subscribe((preferences) => {
  const simulation = useSimulationStore.getState();

  if (
    !preferences.values.developerSettingsEnabled.value &&
    (simulation.update || simulation.gitIdentity)
  )
    simulation.reset();
});
