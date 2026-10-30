import { useShellStore, type SettingsTarget } from "../stores/shell-store";

export function openSettings(section: SettingsTarget) {
  useShellStore.getState().openSettings(section);
}
