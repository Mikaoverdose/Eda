import { t, type MessageKey } from "./i18n";

// Keep these codes in sync with Eda-Website's apps/api/src/errors.ts.
export const UPDATE_API_ERROR = {
  NO_STABLE_RELEASE: "NO_STABLE_RELEASE",
  RELEASE_TARGET_NOT_FOUND: "RELEASE_TARGET_NOT_FOUND",
  UNSUPPORTED_UPDATE_TARGET: "UNSUPPORTED_UPDATE_TARGET",
  UNKNOWN_UPDATE_MANIFEST: "UNKNOWN_UPDATE_MANIFEST",
  INVALID_RELEASE_ASSET_URL: "INVALID_RELEASE_ASSET_URL",
  EMPTY_GITHUB_RESPONSE: "EMPTY_GITHUB_RESPONSE",
  RELEASE_METADATA_TOO_LARGE: "RELEASE_METADATA_TOO_LARGE",
  GITHUB_RELEASE_LOOKUP_FAILED: "GITHUB_RELEASE_LOOKUP_FAILED",
  INVALID_STABLE_RELEASE: "INVALID_STABLE_RELEASE",
  GITHUB_MANIFEST_LOOKUP_FAILED: "GITHUB_MANIFEST_LOOKUP_FAILED",
  INVALID_RELEASE_MANIFEST: "INVALID_RELEASE_MANIFEST",
  INVALID_RELEASE_CHECKSUM: "INVALID_RELEASE_CHECKSUM",
  RELEASE_ARTIFACT_MISMATCH: "RELEASE_ARTIFACT_MISMATCH",
  RELEASE_METADATA_UNAVAILABLE: "RELEASE_METADATA_UNAVAILABLE",
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
  INVALID_PORT: "INVALID_PORT",
} as const;
export const UPDATE_API_ERROR_KEYS = {
  [UPDATE_API_ERROR.NO_STABLE_RELEASE]: "updates.api.noStableRelease",
  [UPDATE_API_ERROR.RELEASE_TARGET_NOT_FOUND]: "updates.api.releaseTargetNotFound",
  [UPDATE_API_ERROR.UNSUPPORTED_UPDATE_TARGET]: "updates.api.unsupportedUpdateTarget",
  [UPDATE_API_ERROR.UNKNOWN_UPDATE_MANIFEST]: "updates.api.unknownUpdateManifest",
  [UPDATE_API_ERROR.INVALID_RELEASE_ASSET_URL]: "updates.api.invalidReleaseAssetUrl",
  [UPDATE_API_ERROR.EMPTY_GITHUB_RESPONSE]: "updates.api.emptyGithubResponse",
  [UPDATE_API_ERROR.RELEASE_METADATA_TOO_LARGE]: "updates.api.releaseMetadataTooLarge",
  [UPDATE_API_ERROR.GITHUB_RELEASE_LOOKUP_FAILED]: "updates.api.githubReleaseLookupFailed",
  [UPDATE_API_ERROR.INVALID_STABLE_RELEASE]: "updates.api.invalidStableRelease",
  [UPDATE_API_ERROR.GITHUB_MANIFEST_LOOKUP_FAILED]: "updates.api.githubManifestLookupFailed",
  [UPDATE_API_ERROR.INVALID_RELEASE_MANIFEST]: "updates.api.invalidReleaseManifest",
  [UPDATE_API_ERROR.INVALID_RELEASE_CHECKSUM]: "updates.api.invalidReleaseChecksum",
  [UPDATE_API_ERROR.RELEASE_ARTIFACT_MISMATCH]: "updates.api.releaseArtifactMismatch",
  [UPDATE_API_ERROR.RELEASE_METADATA_UNAVAILABLE]: "updates.api.releaseMetadataUnavailable",
  [UPDATE_API_ERROR.ROUTE_NOT_FOUND]: "updates.api.routeNotFound",
  [UPDATE_API_ERROR.INVALID_PORT]: "updates.api.invalidPort",
} as const satisfies Record<(typeof UPDATE_API_ERROR)[keyof typeof UPDATE_API_ERROR], MessageKey>;

export function localizedUpdateApiError(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  const details = error as {
    code?: unknown;
    error?: unknown;
    message?: unknown;
    description?: unknown;
  };
  // electron-updater wraps HTTP failures in an Error containing the JSON response.
  const candidates = [details.code, details.error];
  for (const text of [details.message, details.description]) {
    if (typeof text !== "string") continue;
    const match = /"error"\s*:\s*"([A-Z_]+)"/.exec(text);
    if (match) candidates.push(match[1]);
  }
  for (const code of candidates) {
    if (typeof code === "string" && Object.hasOwn(UPDATE_API_ERROR_KEYS, code))
      return t(UPDATE_API_ERROR_KEYS[code as keyof typeof UPDATE_API_ERROR_KEYS]);
  }
  return undefined;
}
