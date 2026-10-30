import { t } from "@shared/i18n";
import type { ThemePreference } from "@shared/preferences/settings";
import { Globe, Monitor, Moon, Sun } from "lucide-react";
import { useId } from "react";
import { cx, RadioCard } from "../../../components/ui/index";
import { ThemeGrid } from "./ThemeGrid";

export function ThemePreferences({
  value,
  onChange,
  inheritance,
}: {
  inheritance?: { following: boolean; onFollow: () => void } | undefined;
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}) {
  const groupName = useId();
  const selectedMode = inheritance?.following ? "global" : value.mode;
  const modes = [
    ...(inheritance
      ? [{ mode: "global" as const, label: t("common.followGlobal"), icon: Globe }]
      : []),
    { mode: "system" as const, label: t("settings.themePreferences.system"), icon: Monitor },
    { mode: "light" as const, label: t("settings.themePreferences.light"), icon: Sun },
    { mode: "dark" as const, label: t("settings.themePreferences.dark"), icon: Moon },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">{t("settings.themePreferences.colorMode")}</h2>
        <div
          role="radiogroup"
          aria-label={t("settings.themePreferences.appearanceMode")}
          className={cx("grid grid-cols-1 gap-2 sm:grid-cols-2", !inheritance && "xl:grid-cols-3")}
        >
          {modes.map(({ mode, label, icon: Icon }) => (
            <RadioCard
              key={mode}
              name={groupName}
              value={mode}
              checked={selectedMode === mode}
              onChange={() => {
                if (mode === "global") inheritance?.onFollow();
                else onChange({ ...value, mode });
              }}
            >
              <span className="flex h-7 w-10 shrink-0 items-center justify-center text-text-secondary">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span
                className={cx(
                  "min-w-0 flex-1 text-sm",
                  selectedMode === mode ? "font-medium text-text-primary" : "text-text-secondary",
                )}
              >
                {label}
              </span>
              <span
                aria-hidden="true"
                className="radio-control"
                data-checked={selectedMode === mode}
              />
            </RadioCard>
          ))}
        </div>
      </div>
      <fieldset disabled={inheritance?.following} className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sun size={16} aria-hidden="true" />
          {t("settings.themePreferences.lightTheme")}
        </h2>
        <ThemeGrid
          appearance="light"
          selected={value.light}
          onChange={(light) => onChange({ ...value, light })}
        />
      </fieldset>
      <fieldset disabled={inheritance?.following} className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Moon size={16} aria-hidden="true" />
          {t("settings.themePreferences.darkTheme")}
        </h2>
        <ThemeGrid
          appearance="dark"
          selected={value.dark}
          onChange={(dark) => onChange({ ...value, dark })}
        />
      </fieldset>
    </div>
  );
}
