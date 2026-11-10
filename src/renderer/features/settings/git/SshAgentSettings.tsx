import { t } from "@shared/i18n";
import { useId } from "react";
import { useScopedSetting } from "../hooks/useScopedSetting";
import { usePreferencesStore } from "../../../stores/preferences-store";
import { RadioCard } from "../../../components/ui/index";

export function SshAgentSettings() {
  const group = useId();
  const agent = useScopedSetting("sshAgent", "application");
  const saving = usePreferencesStore((state) => state.saving);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">{t("settings.sshAgentSettings.sshAgent")}</h2>
      <p className="text-xs text-text-secondary">
        {t("settings.sshAgentSettings.chooseHowEdaKeepsPassphraseProtectedSshKeysUnlocked")}
      </p>
      <fieldset disabled={agent.unavailable || saving}>
        <div
          role="radiogroup"
          aria-label={t("settings.sshAgentSettings.sshAgent")}
          className="grid gap-2 sm:grid-cols-2"
        >
          {(
            [
              [
                "builtin",
                t("settings.sshAgentSettings.builtInAgentRecommended"),
                t("settings.sshAgentSettings.edaStartsAndStopsItsOwnAgent"),
              ],
              [
                "system",
                t("settings.sshAgentSettings.systemAgent"),
                t("settings.sshAgentSettings.useTheAgentProvidedByYourDesktopSession"),
              ],
            ] as const
          ).map(([value, label, description]) => (
            <RadioCard
              key={value}
              name={group}
              value={value}
              checked={agent.resolved.value === value}
              onChange={() => void agent.set(value)}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-text-secondary">{description}</p>
              </div>
              <span
                aria-hidden="true"
                className="radio-control"
                data-checked={agent.resolved.value === value}
              />
            </RadioCard>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-text-secondary">
        {t("settings.sshAgentSettings.changesTakeEffectAfterRestartingEda")}
      </p>
    </section>
  );
}
