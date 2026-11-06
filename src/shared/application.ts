export type DesktopPlatform = "mac" | "windows" | "linux";

export const PACKAGE_MANAGER_NAMES = {
  homebrew: "Homebrew",
  dpkg: "APT / dpkg",
  rpm: "RPM",
  pacman: "Pacman",
} as const;

export type InstallationInfo =
  | { method: "development" | "direct" | "homebrew" | "unknown" }
  | { method: "system-package"; manager: "dpkg" | "rpm" | "pacman" };

export interface GraphicsStatus {
  enabledAtStartup: boolean;
  compositing: "hardware" | "software" | "pending";
}
