import { ERROR_CODE } from "@shared/error-codes";
import { AppError } from "@shared/errors";
import type { UpdateProgress, UpdateRelease } from "@shared/updates";
import type { AppUpdater, ProgressInfo } from "electron-updater";
import updater from "electron-updater";
import { releaseFromManifest } from "./update-manifest";
import type { UpdateDriver } from "./update-service";

export class NativeUpdater implements UpdateDriver {
  private readonly updater: AppUpdater;
  private token: InstanceType<typeof updater.CancellationToken> | undefined;
  private installing = false;

  constructor(feedUrl: string, installError: (error: unknown) => void) {
    const options = {
      provider: "generic" as const,
      url: feedUrl,
      channel: "latest",
      useMultipleRangeRequest: false,
    };
    this.updater =
      process.platform === "win32"
        ? new updater.NsisUpdater(options)
        : process.platform === "darwin"
          ? new updater.MacUpdater(options)
          : new updater.AppImageUpdater(options);
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.allowPrerelease = false;
    this.updater.allowDowngrade = false;
    this.updater.disableWebInstaller = true;
    this.updater.logger = null;
    this.updater.on("error", (error) => {
      if (this.installing) {
        this.installing = false;
        installError(error);
      }
    });
  }

  async check(): Promise<{ available: boolean; release: UpdateRelease }> {
    const result = await this.updater.checkForUpdates();
    if (!result) throw new AppError(ERROR_CODE.UPDATER_UNAVAILABLE);
    return {
      available: result.isUpdateAvailable,
      release: releaseFromManifest(result.updateInfo),
    };
  }

  async download(progress: (value: UpdateProgress) => void): Promise<void> {
    const token = new updater.CancellationToken();
    this.token = token;
    const listener = (value: ProgressInfo) =>
      progress({
        percent: Math.max(0, Math.min(100, Number.isFinite(value.percent) ? value.percent : 0)),
        transferred: Math.max(0, value.transferred),
        total: Math.max(0, value.total),
        bytesPerSecond: Math.max(0, value.bytesPerSecond),
      });
    this.updater.on("download-progress", listener);
    try {
      await this.updater.downloadUpdate(token);
    } finally {
      this.updater.removeListener("download-progress", listener);
      this.token = undefined;
    }
  }

  cancel(): void {
    this.token?.cancel();
  }

  install(): void {
    this.installing = true;
    this.updater.quitAndInstall(false, true);
  }
}
