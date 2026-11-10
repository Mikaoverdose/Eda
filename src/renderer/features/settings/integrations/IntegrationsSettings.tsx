import { GitLabConnection } from "../../connections/GitLabConnection";
import { GitLabSelfHostedConnection } from "../../connections/GitLabSelfHostedConnection";
import { t } from "@shared/i18n";
import { GitHubConnection } from "../../connections/GitHubConnection";
import { ProviderIcon } from "../../connections/ProviderIcon";

export function IntegrationsSettings({ profileId }: { profileId: string }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] items-start gap-3">
        <GitHubConnection key={profileId} profileId={profileId} />
        <GitLabConnection key={`gitlab:${profileId}`} profileId={profileId} />
        <GitLabSelfHostedConnection key={`gitlab-self-hosted:${profileId}`} profileId={profileId} />
      </div>

      <div className="flex items-center gap-3 px-1 text-xs text-text-tertiary">
        <span
          className="flex items-center gap-2 opacity-50"
          title={t("settings.integrationsSettings.upcomingProviders")}
        >
          {(["GitHub Enterprise", "Bitbucket", "Azure DevOps"] as const).map((provider) => (
            <ProviderIcon key={provider} provider={provider} />
          ))}
        </span>

        <p>{t("settings.integrationsSettings.moreComing")}</p>
      </div>
    </div>
  );
}
