import { t } from "@shared/i18n";
import type { GitLabTokenForm } from "@shared/integrations/gitlab-self-hosted";
import { ExternalLink } from "lucide-react";
import { Button, Field, Input } from "../../components/ui/index";

interface Props {
  step: number;
  baseUrl: string;
  token: string;
  busy: boolean;
  onBaseUrlChange(value: string): void;
  onTokenChange(value: string): void;
  onOpenTokenSettings(form: GitLabTokenForm): void;
}

export function GitLabSelfHostedSetupStep({
  step,
  baseUrl,
  token,
  busy,
  onBaseUrlChange,
  onTokenChange,
  onOpenTokenSettings,
}: Props) {
  if (step === 1)
    return (
      <Field label={t("settings.gitLabSelfHosted.instanceUrl")}>
        {(field) => (
          <Input
            {...field}
            autoFocus
            value={baseUrl}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            placeholder={t("settings.gitLabSelfHosted.instancePlaceholder")}
            onChange={(event) => onBaseUrlChange(event.target.value)}
          />
        )}
      </Field>
    );

  return (
    <div className="space-y-2">
      <Field label={t("settings.gitLabSelfHosted.token")}>
        {(field) => (
          <Input
            {...field}
            autoFocus
            type="password"
            value={token}
            disabled={busy}
            autoComplete="new-password"
            spellCheck={false}
            onChange={(event) => onTokenChange(event.target.value)}
          />
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          icon={<ExternalLink size={13} />}
          onClick={() => onOpenTokenSettings("legacy")}
        >
          {t("settings.gitLabSelfHosted.legacyToken")}
        </Button>

        <Button
          size="sm"
          variant="quiet"
          disabled={busy}
          icon={<ExternalLink size={13} />}
          onClick={() => onOpenTokenSettings("granular")}
        >
          {t("settings.gitLabSelfHosted.chooseTokenType")}
        </Button>
      </div>

      <Button
        size="sm"
        variant="quiet"
        disabled={busy}
        icon={<ExternalLink size={13} />}
        onClick={() => onOpenTokenSettings("older")}
      >
        {t("settings.gitLabSelfHosted.olderGitLab")}
      </Button>
    </div>
  );
}
