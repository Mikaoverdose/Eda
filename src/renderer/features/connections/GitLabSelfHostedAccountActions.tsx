import { t } from "@shared/i18n";
import type { GitLabSelfHostedAccount } from "@shared/integrations/gitlab-self-hosted";
import { KeyRoundIcon as KeyRound, UnplugIcon as Unplug } from "../../components/ui/icons";
import { ActionsMenu } from "../../components/ui/index";

export function GitLabSelfHostedAccountActions({
  account,
  disabled,
  onEdit,
  onDisconnect,
}: {
  account: GitLabSelfHostedAccount;
  disabled: boolean;
  onEdit(baseUrl: string): void;
  onDisconnect(baseUrl: string): void;
}) {
  return (
    <ActionsMenu
      label={t("settings.connections.manageInstance", { instance: account.baseUrl })}
      disabled={disabled}
      items={[
        {
          label: t("settings.gitLabSelfHosted.editToken"),
          icon: <KeyRound size={14} />,
          onSelect: () => onEdit(account.baseUrl),
        },
        {
          label: t("settings.gitLabSelfHosted.disconnect"),
          icon: <Unplug size={14} />,
          danger: true,
          onSelect: () => onDisconnect(account.baseUrl),
        },
      ]}
    />
  );
}
