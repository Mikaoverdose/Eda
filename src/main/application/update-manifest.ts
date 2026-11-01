import type { UpdateRelease } from "@shared/updates";
import type { VelopackAsset } from "velopack";
import { AppError } from "@shared/errors";
import { ERROR_CODE } from "@shared/error-codes";
import { UPDATE_PACKAGE_ID } from "@shared/updates";

export function releaseFromManifest(info: VelopackAsset): UpdateRelease {
  if (
    info.PackageId !== UPDATE_PACKAGE_ID ||
    info.Type !== "Full" ||
    !/^\d+\.\d+\.\d+$/.test(info.Version)
  )
    throw new AppError(ERROR_CODE.INVALID_STABLE_VERSION);

  return {
    version: info.Version,
    name: `Eda ${info.Version}`,
    notes: info.NotesMarkdown ? info.NotesMarkdown.slice(0, 16_000) : null,
    releasedAt: null,
  };
}
