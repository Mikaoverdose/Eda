import Color from "colorjs.io";

export type AccentColor = number | `#${string}`;

export const ACCENT_SWATCH_LIGHTNESS = 0.62;
export const DEFAULT_ACCENT_CHROMA = 0.14;

const NEUTRAL_CHROMA_THRESHOLD = 0.00001;
const MAX_RGB_CHANNEL = 255;

export function isHexColor(value: unknown): value is `#${string}` {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

export function accentComponents(value: AccentColor): { hue: number; chroma: number } {
  if (typeof value === "number") return { hue: Math.round(value), chroma: DEFAULT_ACCENT_CHROMA };

  const [, chroma, hue] = new Color(value).to("oklch").coords;

  if (chroma === null || chroma < NEUTRAL_CHROMA_THRESHOLD) return { hue: 0, chroma: 0 };

  return { hue: hue ?? 0, chroma };
}

function toHexChannel(channel: number | null): string {
  const clamped = Math.max(0, Math.min(1, channel ?? 0));
  return Math.round(clamped * MAX_RGB_CHANNEL)
    .toString(16)
    .padStart(2, "0");
}

export function accentToHex(value: AccentColor): `#${string}` {
  if (typeof value === "string") return value.toLowerCase() as `#${string}`;

  const color = new Color("oklch", [ACCENT_SWATCH_LIGHTNESS, DEFAULT_ACCENT_CHROMA, value]);
  const channels = color.to("srgb").coords.map(toHexChannel);

  return `#${channels.join("")}`;
}
