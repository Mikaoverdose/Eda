export type DesktopPlatform = "mac" | "windows" | "linux";

export interface GraphicsStatus {
  enabledAtStartup: boolean;
  compositing: "hardware" | "software" | "pending";
}
