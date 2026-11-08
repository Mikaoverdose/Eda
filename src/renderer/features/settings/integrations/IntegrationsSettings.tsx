import { GitLabConnection } from "../../connections/GitLabConnection";
import { t } from "@shared/i18n";
import { Button } from "../../../components/ui/index";
import { GitHubConnection } from "../../connections/GitHubConnection";
import { ServiceAccountCard } from "../../connections/ServiceAccountCard";

export function IntegrationsSettings({ profileId }: { profileId: string }) {
  return (
    <div className="grid max-w-[76rem] grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-4">
      <GitHubConnection key={profileId} profileId={profileId} />
      <GitLabConnection key={`gitlab:${profileId}`} profileId={profileId} />
      {(["GitHub Enterprise", "GitLab Self-Hosted", "Bitbucket", "Azure DevOps"] as const).map(
        (provider) => (
          <ServiceAccountCard
            key={provider}
            provider={provider}
            status={
              <span className="text-xs text-text-tertiary">
                {t("settings.integrationsSettings.comingSoon")}
              </span>
            }
            actions={
              <Button
                size="sm"
                disabled
                aria-label={t("settings.integrationsSettings.connectComingSoon", {
                  provider: provider,
                })}
              >
                {t("settings.integrationsSettings.connect", { provider: provider })}
              </Button>
            }
            children={null}
          />
        ),
      )}
    </div>
  );
}
