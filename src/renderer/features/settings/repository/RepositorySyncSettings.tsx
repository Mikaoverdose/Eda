import { t } from "@shared/i18n";
import type { RefObject } from "react";
import { FetchSettings } from "../git/FetchSettings";
import { RepositoryPullSettings } from "./RepositoryPullSettings";
import { RepositoryRemotesSettings } from "./RepositoryRemotesSettings";
import type { SettingsSection } from "../settings-sections";

export function RepositorySyncSettings({
  repositoryId,
  anchors,
}: {
  repositoryId: string;
  anchors: RefObject<Partial<Record<SettingsSection, HTMLElement>>>;
}) {
  return (
    <div className="space-y-8">
      <section
        id="settings-repository-fetch"
        ref={(element) => {
          if (element) anchors.current["repository-fetch"] = element;
          else delete anchors.current["repository-fetch"];
        }}
        className="scroll-mt-8"
        aria-label={t("settings.fetchSettings")}
      >
        <FetchSettings repositoryId={repositoryId} />
      </section>

      <section
        id="settings-repository-pull"
        ref={(element) => {
          if (element) anchors.current["repository-pull"] = element;
          else delete anchors.current["repository-pull"];
        }}
        className="scroll-mt-8 space-y-4 border-t border-border-subtle pt-6"
        aria-labelledby="repository-pull-heading"
      >
        <h2 id="repository-pull-heading" className="text-sm font-medium">
          {t("settings.pull")}
        </h2>
        <RepositoryPullSettings repositoryId={repositoryId} />
      </section>

      <section
        id="settings-repository-remotes"
        ref={(element) => {
          if (element) anchors.current["repository-remotes"] = element;
          else delete anchors.current["repository-remotes"];
        }}
        className="scroll-mt-8 space-y-4 border-t border-border-subtle pt-6"
        aria-labelledby="repository-remotes-heading"
      >
        <h2 id="repository-remotes-heading" className="text-sm font-medium">
          {t("settings.remotes")}
        </h2>
        <p className="text-xs text-text-tertiary">
          {t("settings.manageRemoteNamesAndFetchAndPushUrLs")}
        </p>
        <RepositoryRemotesSettings repositoryId={repositoryId} />
      </section>
    </div>
  );
}
