import { t } from "@shared/i18n";
import { THEME_FAMILIES } from "@shared/preferences/settings";
import { accentComponents, type AccentColor } from "@shared/preferences/accent";

export const NEUTRAL_CHROMA = "0.02";

export interface Theme {
  id: string;
  name: string;
  appearance: "dark" | "light";
  tokens?: Record<string, string>;
  preview: { background: string; surface: string; accent: string };
}

export const BUILT_IN_THEMES: readonly Theme[] = THEME_FAMILIES.flatMap((family) =>
  (["light", "dark"] as const).map((appearance): Theme => {
    const id = family[appearance];

    return {
      id,
      name: t(appearance === "light" ? "settings.theme.lightName" : "settings.theme.darkName", {
        name: family.name,
      }),
      appearance,
      preview: {
        background: "var(--bg-base)",
        surface: "var(--bg-raised)",
        accent: "var(--accent)",
      },
    };
  }),
);

let appliedOverrides: string[] = [];

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  for (const token of appliedOverrides) {
    if (!Object.hasOwn(theme.tokens ?? {}, token)) root.style.removeProperty(`--${token}`);
  }

  root.dataset["theme"] = theme.id;
  root.dataset["appearance"] = theme.appearance;

  for (const [token, value] of Object.entries(theme.tokens ?? {})) {
    if (root.style.getPropertyValue(`--${token}`) !== value)
      root.style.setProperty(`--${token}`, value);
  }

  appliedOverrides = Object.keys(theme.tokens ?? {});
}

export function applyIdentityHue(value: AccentColor | null): void {
  const root = document.documentElement;
  const components = value === null ? null : accentComponents(value);
  const chroma = components ? String(components.chroma) : NEUTRAL_CHROMA;

  if (components && root.style.getPropertyValue("--identity-hue") !== String(components.hue))
    root.style.setProperty("--identity-hue", String(components.hue));
  if (root.style.getPropertyValue("--identity-chroma") !== chroma)
    root.style.setProperty("--identity-chroma", chroma);
}
