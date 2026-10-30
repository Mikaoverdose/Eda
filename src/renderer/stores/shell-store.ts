import { create } from "zustand";

export type SettingsTarget = "repository-fetch" | "repository-remotes" | "integrations" | "about";
type ShellRequest = { kind: "settings"; section: SettingsTarget } | { kind: "tour" };

interface ShellState {
  request: ShellRequest | null;
  openSettings: (section: SettingsTarget) => void;
  startTour: () => void;
  consume: (request: ShellRequest) => void;
}

export const useShellStore = create<ShellState>((set, get) => ({
  request: null,
  openSettings: (section) => set({ request: { kind: "settings", section } }),
  startTour: () => set({ request: { kind: "tour" } }),
  consume: (request) => {
    if (get().request === request) set({ request: null });
  },
}));
