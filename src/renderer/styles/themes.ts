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

const PALETTES: Record<string, Record<string, string>> = {
  "eda-light": {
    "bg-base": "#f4f4f4",
    "bg-surface": "#fafafa",
    "bg-raised": "#ededf0",
    "bg-overlay": "#fafafa",
    "bg-inset": "#f3f3f6",
    "border-subtle": "#e5e5eb",
    "border-default": "#cdcdd6",
    "border-strong": "#a0a0ae",
    "control-border": "#777781",
    "text-primary": "#25252b",
    "text-secondary": "#555560",
    "text-tertiary": "#686874",
    "text-inverse": "#ffffff",
  },
  "eda-dark": {
    "bg-base": "#1b1b1e",
    "bg-surface": "#202023",
    "bg-raised": "#2a2a2e",
    "bg-overlay": "#242427",
    "bg-inset": "#171719",
    "border-subtle": "#2b2b30",
    "border-default": "#39393f",
    "border-strong": "#63636c",
    "control-border": "#85858f",
    "text-primary": "#ededee",
    "text-secondary": "#b5b5bd",
    "text-tertiary": "#a0a0aa",
    "text-inverse": "#1b1b1e",
  },
  "lavender-light": {
    "bg-base": "#f8f6fc",
    "bg-surface": "#f0edf7",
    "bg-raised": "#e6e0f0",
    "bg-overlay": "#fdfbff",
    "bg-inset": "#ece7f4",
    "border-subtle": "#e1daec",
    "border-default": "#c9bfd9",
    "border-strong": "#a092b6",
    "control-border": "#7c6b94",
    "text-primary": "#30283e",
    "text-secondary": "#5b4f6e",
    "text-tertiary": "#6b5d7e",
    "text-inverse": "#fdfbff",
  },
  "lavender-dark": {
    "bg-base": "#211d2b",
    "bg-surface": "#292433",
    "bg-raised": "#363042",
    "bg-overlay": "#302a3b",
    "bg-inset": "#1b1724",
    "border-subtle": "#393145",
    "border-default": "#4e435f",
    "border-strong": "#7f6e96",
    "control-border": "#a390ba",
    "text-primary": "#eee8f7",
    "text-secondary": "#c9bddb",
    "text-tertiary": "#b4a5c9",
    "text-inverse": "#211d2b",
  },
  "nord-light": {
    "bg-base": "#eceff4",
    "bg-surface": "#e5e9f0",
    "bg-raised": "#d8dee9",
    "bg-overlay": "#f5f7fa",
    "bg-inset": "#e2e7ee",
    "border-subtle": "#d1dae6",
    "border-default": "#b3bfd0",
    "border-strong": "#8595ad",
    "control-border": "#62758f",
    "text-primary": "#2e3440",
    "text-secondary": "#4c566a",
    "text-tertiary": "#526077",
    "text-inverse": "#f5f7fa",
  },
  nord: {
    "bg-base": "#2e3440",
    "bg-surface": "#353e4d",
    "bg-raised": "#434c5e",
    "bg-overlay": "#3b4555",
    "bg-inset": "#272e39",
    "border-subtle": "#434c5e",
    "border-default": "#58657b",
    "border-strong": "#7e90aa",
    "control-border": "#a0b1c8",
    "text-primary": "#eceff4",
    "text-secondary": "#d8dee9",
    "text-tertiary": "#bdccdf",
    "text-inverse": "#2e3440",
  },
};

export const BUILT_IN_THEMES: readonly Theme[] = THEME_FAMILIES.flatMap((family) =>
  (["light", "dark"] as const).map((appearance): Theme => {
    const id = family[appearance];
    const tokens = PALETTES[id]!;

    return {
      id,
      name: t(appearance === "light" ? "settings.theme.lightName" : "settings.theme.darkName", {
        name: family.name,
      }),
      appearance,
      tokens,
      preview: {
        background: tokens["bg-base"]!,
        surface: tokens["bg-raised"]!,
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
