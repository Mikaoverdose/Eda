import { t } from "@shared/i18n";
import type { UpdateInfo } from "electron-updater";
import type { UpdateRelease } from "@shared/updates";

export function releaseFromManifest(info: UpdateInfo, feedUrl: string): UpdateRelease {
  if (!info.files?.length || info.files.length > 8)
    throw new Error(t("main.updateManifest.invalidUpdateFiles"));
  for (const file of info.files) {
    const url = new URL(file.url, feedUrl);
    if (
      url.protocol !== "https:" ||
      url.origin !== new URL(feedUrl).origin ||
      url.username ||
      url.password ||
      !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)
    )
      throw new Error(t("main.updateManifest.invalidUpdateArtifact"));
  }
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
