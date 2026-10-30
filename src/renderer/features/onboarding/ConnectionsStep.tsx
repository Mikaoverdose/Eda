import { t } from "@shared/i18n";
import { useAppStore } from "../../stores/app-store";
import { ConnectionCard } from "../connections/ConnectionCard";
import { GitHubConnection } from "../connections/GitHubConnection";
import { ProviderIcon } from "../connections/ProviderIcon";
import { SshSetupCard } from "./SshSetupCard";

export function ConnectionsStep({ profileId }: { profileId: string }) {
  const identity = useAppStore((state) => state.activeIdentity);
  return (
    <div className="space-y-3">
      <GitHubConnection key={profileId} profileId={profileId} compact />
      {(["GitLab", "Bitbucket", "Azure DevOps"] as const).map((provider) => (
        <ConnectionCard
          key={provider}
          title={provider}
          icon={<ProviderIcon provider={provider} />}
        />
      ))}
      {identity?.id === profileId && <SshSetupCard key={profileId} identity={identity} />}
      <p className="text-xs leading-relaxed text-text-tertiary">
        {t("onboarding.connectionsStep.connectionsAndKeysBelongToThisProfileYou")}
      </p>
    </div>
  );
}
