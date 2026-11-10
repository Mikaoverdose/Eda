import { t } from "@shared/i18n";
import type { GitLabSelfHostedAccount } from "@shared/integrations/gitlab-self-hosted";
import { Button } from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";
import { ConnectionAccount } from "./ConnectionAccount";
import { GitLabSelfHostedAccountActions } from "./GitLabSelfHostedAccountActions";

interface Props {
  account: GitLabSelfHostedAccount;
  busy: boolean;
  secureStorage: boolean;
  onOpen(baseUrl: string): void;
  onEdit(baseUrl: string): void;
  onDisconnect(baseUrl: string): void;
}

export function GitLabSelfHostedAccountCard({
  account,
  busy,
  secureStorage,
  onOpen,
  onEdit,
  onDisconnect,
}: Props) {
  const { baseUrl, login, state } = account;
  const hue = useAppStore((value) => value.activeIdentity?.hue ?? 210);

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <ConnectionAccount
        login={login}
        name={baseUrl.replace(/^https:\/\//, "")}
        hue={hue}
        avatarName={login}
        disabled={busy}
        connected={state === "connected"}
        profileLabel={t("settings.gitLabSelfHosted.viewProfile", { login, instance: baseUrl })}
        onOpen={() => onOpen(baseUrl)}
      />

      <div className="flex shrink-0 items-center gap-2">
        {state !== "connected" && (
          <Button size="sm" disabled={busy || !secureStorage} onClick={() => onEdit(baseUrl)}>
            {t("settings.connections.reconnect")}
          </Button>
        )}

        <GitLabSelfHostedAccountActions
          account={account}
          disabled={busy || !secureStorage}
          onEdit={onEdit}
          onDisconnect={onDisconnect}
        />
      </div>
    </div>
  );
}
