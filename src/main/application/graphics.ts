import type { GraphicsStatus } from "@shared/application";
import { app } from "electron";
import { join } from "node:path";
import { readHardwareAcceleration } from "../persistence/startup-settings";

let enabledAtStartup = true;
let gpuReady = false;

export function configureGraphics(): void {
  app.on("gpu-info-update", () => {
    gpuReady = true;

    if (!app.isPackaged) {
      const status = app.getGPUFeatureStatus();

      console.info(
        "[Eda graphics] " +
          JSON.stringify({
            enabledAtStartup,
            compositing: status.gpu_compositing,
            rasterization: status.rasterization,
            vulkan: "vulkan" in status ? status.vulkan : "unreported",
            session: process.env["XDG_SESSION_TYPE"] ?? "unknown",
            ozone: app.commandLine.getSwitchValue("ozone-platform") || "auto",
          }),
      );
    }
  });
  enabledAtStartup = readHardwareAcceleration(join(app.getPath("userData"), "eda.db"));

  if (!enabledAtStartup) app.disableHardwareAcceleration();
}

export function graphicsStatus(): GraphicsStatus {
  const compositing = gpuReady ? app.getGPUFeatureStatus().gpu_compositing : undefined;

  return {
    enabledAtStartup,
    compositing: compositing === "enabled" ? "hardware" : compositing ? "software" : "pending",
  };
}
