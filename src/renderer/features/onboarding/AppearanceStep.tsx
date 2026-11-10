import { ThemePreview } from "../settings/appearance/ThemeGrid";
import { useId } from "react";
import { t } from "@shared/i18n";
import { Monitor, Moon, Sun } from "lucide-react";
import type { AccentColor } from "@shared/preferences/accent";
import { BackgroundChoice } from "./BackgroundChoice";
import type { BackgroundPreference, ThemePreference } from "@shared/preferences/settings";
import { THEME_FAMILIES } from "@shared/preferences/settings";
import { BUILT_IN_THEMES } from "../../styles/themes";
import { Checkbox, HuePicker, RadioCard, SegmentedControl } from "../../components/ui/index";

export function AppearanceStep({
  theme,
  hue,
  onTheme,
  onHue,
  background,
  onBackground,
  reducedMotion,
  onReducedMotion,
}: {
  reducedMotion: boolean;
  onReducedMotion: (value: boolean) => void;
  background: BackgroundPreference;
  onBackground: (value: BackgroundPreference) => void;
  theme: ThemePreference;
  hue: AccentColor;
  onTheme: (theme: ThemePreference) => void;
  onHue: (hue: AccentColor) => void;
}) {
  const groupName = useId();

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h2 className="text-sm font-medium">{t("onboarding.appearanceStep.appearance")}</h2>

        <SegmentedControl
          label={t("onboarding.appearanceStep.appearanceMode")}
          value={theme.mode}
          onChange={(mode) => onTheme({ ...theme, mode })}
          className="w-full"
          options={[
            {
              value: "system",
              label: (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <Monitor size={14} aria-hidden="true" />
                  {t("onboarding.appearanceStep.system")}
                </span>
              ),
            },
            {
              value: "light",
              label: (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <Sun size={14} aria-hidden="true" />
                  {t("onboarding.appearanceStep.light")}
                </span>
              ),
            },
            {
              value: "dark",
              label: (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <Moon size={14} aria-hidden="true" />
                  {t("onboarding.appearanceStep.dark")}
                </span>
              ),
            },
          ]}
        />
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">{t("onboarding.appearanceStep.theme")}</h2>

        <div
          role="radiogroup"
          aria-label={t("onboarding.appearanceStep.themeFamily")}
          className="grid grid-cols-3 gap-2"
        >
          {THEME_FAMILIES.map((family) => {
            const selected = theme.light === family.light && theme.dark === family.dark;

            const light =
              theme.mode === "light" ||
              (theme.mode === "system" &&
                !window.matchMedia("(prefers-color-scheme: dark)").matches);

            const palette = BUILT_IN_THEMES.find(
              (item) => item.id === (light ? family.light : family.dark),
            )!;

            return (
              <RadioCard
                key={family.name}
                name={groupName}
                value={family.name}
                checked={selected}
                className="flex-col gap-3 px-3 py-3"
                onChange={() => onTheme({ ...theme, light: family.light, dark: family.dark })}
              >
                <ThemePreview theme={palette} />
                <span className="text-xs font-medium">{family.name}</span>
              </RadioCard>
            );
          })}
        </div>

        <p className="text-xs text-text-tertiary">
          {t(
            "onboarding.appearanceStep.eachThemeHasLightAndDarkModesExploreMoreThemesLaterInSettings",
          )}
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">{t("onboarding.appearanceStep.accentColor")}</h2>

        <HuePicker
          label={t("onboarding.appearanceStep.accentColor")}
          value={hue}
          onChange={onHue}
        />
      </div>

      <Checkbox checked={reducedMotion} onChange={(event) => onReducedMotion(event.target.checked)}>
        {t("onboarding.appearanceStep.reduceMotion")}
      </Checkbox>
      <BackgroundChoice value={background} onChange={onBackground} />
    </div>
  );
}
