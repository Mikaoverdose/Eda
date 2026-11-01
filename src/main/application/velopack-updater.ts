import { ERROR_CODE } from "@shared/error-codes";
import { AppError } from "@shared/errors";
import {
  UPDATE_PACKAGE_ID,
  updateChannel,
  type UpdatePlatform,
  type UpdateProgress,
} from "@shared/updates";
import type { UpdateInfo, UpdateManager } from "velopack";
import { releaseFromManifest } from "./update-manifest";
import type { UpdateDriver } from "./update-service";

export async function createVelopackUpdater(
  feedUrl: string,
  platform: UpdatePlatform,
  arch: string,
  currentVersion: string,
  quit: () => void,
): Promise<VelopackUpdater> {
  const { HttpSource, UpdateManager } = await import("velopack");
  const manager = new UpdateManager(new HttpSource(feedUrl, { TimeoutMilliseconds: 120_000 }), {
    AllowVersionDowngrade: false,
    ExplicitChannel: updateChannel(platform, arch),
    MaximumDeltasBeforeFallback: -1,
  });

  if (manager.getAppId() !== UPDATE_PACKAGE_ID || manager.getCurrentVersion() !== currentVersion)
    throw new AppError(ERROR_CODE.UPDATER_UNAVAILABLE);

  return new VelopackUpdater(manager, quit);
}

export class VelopackUpdater implements UpdateDriver {
  private update: UpdateInfo | null = null;
  private verified = false;
  private discarded = false;

  constructor(
    private readonly manager: Pick<
      UpdateManager,
      | "checkForUpdatesAsync"
      | "downloadUpdateAsync"
      | "waitExitThenApplyUpdate"
      | "getCurrentVersion"
    >,
    private readonly quit: () => void,
  ) {}

  async check() {
    this.update = await this.manager.checkForUpdatesAsync();
    this.verified = false;

    return {
      available: this.update !== null && !this.update.IsDowngrade,
      release: this.update
        ? releaseFromManifest(this.update.TargetFullRelease)
        : {
            version: this.manager.getCurrentVersion(),
            name: `Eda ${this.manager.getCurrentVersion()}`,
            notes: null,
            releasedAt: null,
          },
    };
  }

  async download(progress: (value: UpdateProgress) => void): Promise<void> {
    if (!this.update || this.update.IsDowngrade) throw new AppError(ERROR_CODE.UPDATER_UNAVAILABLE);

    this.verified = false;
    this.discarded = false;

    await this.manager.downloadUpdateAsync(this.update, (percent) => {
      if (!this.discarded && Number.isFinite(percent))
        progress({ percent: Math.max(0, Math.min(100, percent)) });
    });

    this.verified = !this.discarded;
  }

  discardDownload(): void {
    // The JS SDK cannot abort its transfer. Discard its result and never auto-apply on startup.
    this.discarded = true;
    this.verified = false;
  }

  install(): void {
    if (!this.update || !this.verified) throw new AppError(ERROR_CODE.UPDATER_UNAVAILABLE);

    this.manager.waitExitThenApplyUpdate(this.update, false, true);
    this.quit();
  }
}
