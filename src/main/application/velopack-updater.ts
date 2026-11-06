import { ERROR_CODE } from "@shared/error-codes";
import { AppError } from "@shared/errors";
import {
  UPDATE_PACKAGE_ID,
  updateChannel,
  type UpdatePlatform,
  type UpdateProgress,
} from "@shared/updates";
import { isRecord } from "@shared/validation";
import { readFeed } from "./release-feed";
import type { UpdateInfo, UpdateManager, VelopackAsset } from "velopack";
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

  return new VelopackUpdater(manager, quit, (asset) =>
    verifyPublishedPackage(asset, updateChannel(platform, arch)),
  );
}

export async function verifyPublishedPackage(
  asset: VelopackAsset,
  channel: string,
  request = fetch,
) {
  releaseFromManifest(asset);
  if (
    asset.FileName !== `Eda-${asset.Version}-${channel}-full.nupkg` ||
    !/^[a-f0-9]{64}$/i.test(asset.SHA256) ||
    !Number.isSafeInteger(asset.Size) ||
    asset.Size <= 0
  )
    throw new AppError(ERROR_CODE.INVALID_STABLE_VERSION);
  const release = await readFeed(
    await request(`https://api.github.com/repos/YuzuZensai/Eda/releases/tags/${asset.Version}`, {
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/vnd.github+json" },
    }),
  );
  if (
    !isRecord(release) ||
    release["tag_name"] !== asset.Version ||
    release["draft"] !== false ||
    !Array.isArray(release["assets"]) ||
    !release["assets"].some(
      (entry) =>
        isRecord(entry) &&
        entry["name"] === asset.FileName &&
        entry["size"] === asset.Size &&
        entry["digest"] === `sha256:${asset.SHA256.toLowerCase()}`,
    )
  )
    throw new AppError(ERROR_CODE.INVALID_STABLE_VERSION);
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
    private readonly verifyPackage: (asset: VelopackAsset) => Promise<void>,
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

    const update = this.update;
    if (update.DeltasToTarget.length || update.BaseRelease)
      throw new AppError(ERROR_CODE.INVALID_STABLE_VERSION);
    await this.verifyPackage(update.TargetFullRelease);
    if (this.discarded || update !== this.update) return;
    await this.manager.downloadUpdateAsync(update, (percent) => {
      if (!this.discarded && Number.isFinite(percent))
        progress({ percent: Math.max(0, Math.min(100, percent)) });
    });

    this.verified = !this.discarded && update === this.update;
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
