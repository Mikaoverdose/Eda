import { t } from "@shared/i18n";
import updater from "electron-updater";
import type { AppUpdater, ProgressInfo } from "electron-updater";
import type { UpdateProgress, UpdateRelease } from "@shared/updates";
import type { UpdateDriver } from "./update-service";
import { releaseFromManifest } from "./update-manifest";

export class NativeUpdater implements UpdateDriver {
  private readonly updater: AppUpdater;
  private token: InstanceType<typeof updater.CancellationToken> | undefined;
  private installing = false;

  constructor(
    private readonly feedUrl: string,
    installError: (error: unknown) => void,
  ) {
    const options = { provider: "generic" as const, url: feedUrl, channel: "latest" };
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
    this.updater.netSession.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url);
      callback({
        cancel:
          url.protocol !== "https:" ||
          url.origin !== new URL(feedUrl).origin ||
          !!url.username ||
          !!url.password,
      });
    });
    this.updater.on("error", (error) => {
      if (this.installing) {
        this.installing = false;
        installError(error);
      }
    });
  }

  async check(): Promise<{ available: boolean; release: UpdateRelease }> {
    const result = await this.updater.checkForUpdates();
    if (!result) throw new Error(t("main.nativeUpdater.theNativeUpdaterIsUnavailable"));
    return {
      available: result.isUpdateAvailable,
      release: releaseFromManifest(result.updateInfo, this.feedUrl),
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
