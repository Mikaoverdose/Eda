import type { UpdateRelease } from "@shared/updates";
import type { UpdateInfo } from "electron-updater";

export function releaseFromManifest(info: UpdateInfo): UpdateRelease {
  const notes =
    typeof info.releaseNotes === "string"
      ? info.releaseNotes
      : info.releaseNotes?.map((entry) => entry.note).join("\n\n");
  return {
    version: info.version,
    name:
      typeof info.releaseName === "string" ? info.releaseName.slice(0, 160) : `Eda ${info.version}`,
    notes: notes ? notes.slice(0, 16_000) : null,
    releasedAt:
      info.releaseDate && Number.isFinite(Date.parse(info.releaseDate))
        ? new Date(info.releaseDate).toISOString()
        : null,
  };
}
