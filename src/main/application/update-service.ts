import { ERROR_CODE, errorText, type ErrorText } from "@shared/error-codes";
import { AppError, GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { localizedUpdateApiError } from "@shared/update-api-errors";
import type {
  UpdateCapability,
  UpdatePlatform,
  UpdateProgress,
  UpdateRelease,
  UpdateState,
} from "@shared/updates";
import { UPDATE_FEED_BASE } from "@shared/updates";

export interface UpdateDriver {
  check(): Promise<{ available: boolean; release: UpdateRelease }>;
  download(progress: (value: UpdateProgress) => void): Promise<void>;
  discardDownload(): void;
  install(): void | Promise<void>;
}

export interface UpdateOptions {
  capability: UpdateCapability;
  reason: string | null;
  platform: UpdatePlatform;
  arch: string;
  currentVersion: string;
  automaticChecks: () => boolean;
  createDriver: (url: string) => UpdateDriver;
  prepareInstall: () => Promise<() => void>;
  now?: () => number;
}

export const UPDATE_STARTUP_DELAY = 30_000;
export const UPDATE_CHECK_INTERVAL = 6 * 60 * 60_000;

export class UpdateService {
  private state: UpdateState;
  private readonly listeners = new Set<(state: UpdateState) => void>();
  private driver?: UpdateDriver;
  private checking: Promise<UpdateState> | undefined;
  private downloading: Promise<UpdateState> | undefined;
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private cancelled = false;
  private rollbackInstall: (() => void) | undefined;

  constructor(private readonly options: UpdateOptions) {
    this.state = {
      revision: 0,
      capability: options.capability,
      reason: options.reason,
      phase: "idle",
      checkedAt: null,
      release: null,
      progress: null,
      error: null,
      feedUrl:
        options.capability === "automatic"
          ? `${UPDATE_FEED_BASE}${options.platform}/${options.arch}/`
          : null,
    };
  }

  snapshot(): UpdateState {
    return this.state;
  }

  onChange(listener: (state: UpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(change: Partial<UpdateState>): UpdateState {
    this.state = { ...this.state, ...change, revision: this.state.revision + 1 };
    for (const listener of this.listeners) listener(this.state);
    return this.state;
  }

  start(): void {
    this.running = true;
    this.refreshSchedule();
  }

  refreshSchedule(): void {
    clearTimeout(this.timer);
    if (!this.running || this.state.capability !== "automatic" || !this.options.automaticChecks())
      return;
    const pending = ["available", "downloading", "ready", "installing"].includes(this.state.phase);
    const delay = pending
      ? UPDATE_CHECK_INTERVAL
      : this.state.checkedAt
        ? Math.max(
            UPDATE_STARTUP_DELAY,
            UPDATE_CHECK_INTERVAL -
              ((this.options.now ?? Date.now)() - Date.parse(this.state.checkedAt)),
          )
        : UPDATE_STARTUP_DELAY;
    this.timer = setTimeout(() => {
      void this.check()
        .catch(() => undefined)
        .finally(() => this.refreshSchedule());
    }, delay);
    this.timer.unref();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
    if (this.downloading) {
      this.cancelled = true;
      this.driver?.discardDownload();
    }
  }

  private native(): UpdateDriver {
    this.requireAutomatic();
    return (this.driver ??= this.options.createDriver(this.state.feedUrl!));
  }

  private requireAutomatic(): void {
    if (this.state.capability !== "automatic")
      throw updateRequest(
        errorText("errors.operationBlocked", {
          reason: this.state.reason ?? t("main.updateService.useTheDownloadPageToUpdateEda"),
        }),
      );
  }

  check(): Promise<UpdateState> {
    this.requireAutomatic();
    if (this.checking) return this.checking;
    if (["downloading", "ready", "installing"].includes(this.state.phase))
      return Promise.resolve(this.state);
    this.publish({ phase: "checking", error: null, release: null, progress: null });
    this.checking = Promise.resolve().then(async () => {
      try {
        const result = await this.native().check();
        const newer = newerRelease(result.release.version, this.options.currentVersion);
        const available = result.available && newer;
        return this.publish({
          phase: available ? "available" : "current",
          release: available ? result.release : null,
          reason:
            newer && !result.available
              ? t("main.updateService.aNewerReleaseExistsButIsNotOffered")
              : null,
          checkedAt: new Date((this.options.now ?? Date.now)()).toISOString(),
        });
      } catch (error) {
        return this.publish({
          phase: "error",
          error: updateError(error, "check"),
          checkedAt: new Date((this.options.now ?? Date.now)()).toISOString(),
        });
      } finally {
        this.checking = undefined;
      }
    });
    return this.checking;
  }

  download(): Promise<UpdateState> {
    this.requireAutomatic();
    if (this.downloading) return this.downloading;
    if (this.state.phase !== "available" || !this.state.release)
      throw updateRequest(errorText("main.updateService.checkForAnUpdateBeforeDownloading"));
    this.cancelled = false;
    this.publish({ phase: "downloading", progress: null, error: null });
    this.downloading = Promise.resolve().then(async () => {
      try {
        if (this.cancelled) return this.publish({ phase: "available", progress: null });
        await this.native().download((progress) => {
          if (!this.cancelled && this.state.phase === "downloading") this.publish({ progress });
        });
        return this.publish({ phase: this.cancelled ? "available" : "ready", progress: null });
      } catch (error) {
        return this.publish({
          phase: "available",
          progress: null,
          error: this.cancelled ? null : updateError(error, "download"),
        });
      } finally {
        this.downloading = undefined;
      }
    });
    return this.downloading;
  }

  async discardDownload(): Promise<UpdateState> {
    if (this.downloading) {
      this.cancelled = true;
      this.driver?.discardDownload();
      await this.downloading;
    }
    return this.state;
  }

  async install(): Promise<UpdateState> {
    this.requireAutomatic();
    if (this.state.phase !== "ready")
      throw updateRequest(
        errorText("main.updateService.downloadAndVerifyAnUpdateBeforeInstallingIt"),
      );
    this.publish({ phase: "installing", error: null });
    try {
      this.rollbackInstall = await this.options.prepareInstall();
      await this.native().install();
    } catch (error) {
      this.rollbackInstall?.();
      this.rollbackInstall = undefined;
      this.publish({
        phase: "ready",
        error: error instanceof GitError ? error.message : updateError(error, "install"),
      });
    }
    return this.state;
  }
}

export function newerRelease(candidate: string, current: string): boolean {
  const parse = (value: string) => {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))
      throw new AppError(ERROR_CODE.INVALID_STABLE_VERSION);
    return value.split(".").map((part) => BigInt(part));
  };
  const next = parse(candidate),
    installed = parse(current);
  for (let index = 0; index < 3; index++) {
    if (next[index]! > installed[index]!) return true;
    if (next[index]! < installed[index]!) return false;
  }
  return false;
}

function updateRequest(message: ErrorText): GitError {
  return new GitError({ kind: "invalid-input", operation: t("operations.updateEda"), message });
}

export function updateError(error: unknown, action: "check" | "download" | "install"): string {
  const apiMessage = localizedUpdateApiError(error);
  if (apiMessage) return apiMessage;
  if (error instanceof AppError && error.code === ERROR_CODE.INVALID_STABLE_VERSION)
    return t("main.updateService.theUpdateCouldNotBeVerifiedNothingWas");
  const details =
    error instanceof Error ? `${"code" in error ? error.code : ""} ${error.message}` : "";
  if (/404|ENOTFOUND/.test(details))
    return t("main.updateService.theUpdateServiceIsNotAvailableYetTryAgainLater");
  if (/sha256|checksum|signature|invalid.*(?:hash|package)/i.test(details))
    return t("main.updateService.theUpdateCouldNotBeVerifiedNothingWas");
  if (/TIMEDOUT|TIMEOUT|ECONN|ERR_INTERNET|network|fetch failed|ENET|EAI_AGAIN/i.test(details))
    return t("main.updateService.couldNotReachTheUpdateServiceCheckYourConnectionAndTryAgain");
  return action === "install"
    ? t("main.updateService.edaCouldNotStartTheInstallerTryAgainOrUseTheDownloadPage")
    : action === "download"
      ? t("main.updateService.theUpdateCouldNotBeDownloadedTryAgainOrUseTheDownloadPage")
      : t("main.updateService.couldNotCheckForUpdatesTryAgainLater");
}
