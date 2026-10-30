import { useId } from "react";
import { getLocale, supportedLocales, t } from "@shared/i18n";
import { Select } from "../../../components/ui/index";
import { useScopedSetting } from "../hooks/useScopedSetting";
import { usePreferencesStore } from "../../../stores/preferences-store";

export function LanguageSettings() {
  const language = useScopedSetting("language", "application");
  const saving = usePreferencesStore((state) => state.saving);
  const id = useId();

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {t("settings.language.label")}
      </label>
      <p className="text-xs text-text-secondary">{t("settings.language.description")}</p>
      <Select
        id={id}
        value={language.resolved.value}
        onValueChange={(value) => void language.set(value)}
        disabled={language.reading || saving}
        surface="base"
      >
        <option value="system">{t("settings.language.system")}</option>
        {supportedLocales.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale}
          </option>
        ))}
      </Select>
      <p className="text-xs text-text-tertiary">
        {t("settings.language.restart", {
          language:
            new Intl.DisplayNames([getLocale()], { type: "language" }).of(getLocale()) ??
            getLocale(),
        })}
      </p>
    </div>
  );
}
