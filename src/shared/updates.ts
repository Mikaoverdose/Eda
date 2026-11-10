export const UPDATE_FEED_BASE = "https://eda.kirameki.cafe/api/updates/v1/stable/";
export const UPDATE_PRERELEASE_FEED_BASE = "https://eda.kirameki.cafe/api/updates/v1/preview/";
export const UPDATE_DOWNLOAD_PAGE = "https://eda.kirameki.cafe/download";
export const UPDATE_PACKAGE_ID = "Eda";

export type UpdatePlatform = "win" | "osx" | "linux";

export function updateFeedUrl(
  platform: UpdatePlatform,
  arch: string,
  includePrereleases: boolean,
): string {
  return `${includePrereleases ? UPDATE_PRERELEASE_FEED_BASE : UPDATE_FEED_BASE}${platform}/${arch}/`;
}

export function updateChannel(platform: UpdatePlatform, arch: string): string {
  return `${platform}-${arch}-stable`;
}

export type UpdateCapability = "automatic" | "homebrew" | "managed" | "manual" | "development";
export type UpdatePhase =
  "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "installing" | "error";

export interface UpdateRelease {
  version: string;
  name: string;
  notes: string | null;
  releasedAt: string | null;
}

export interface UpdateProgress {
  percent: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
}

export interface UpdateState {
  revision: number;
  capability: UpdateCapability;
  reason: string | null;
  phase: UpdatePhase;
  feedUrl: string | null;
  checkedAt: string | null;
  release: UpdateRelease | null;
  progress: UpdateProgress | null;
  error: string | null;
}
