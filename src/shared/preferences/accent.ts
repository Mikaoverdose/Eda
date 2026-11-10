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

  const [red, green, blue] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / MAX_RGB_CHANNEL;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  const light = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);

  const a = 1.9779984951 * light - 2.428592205 * medium + 0.4505937099 * short;
  const b = 0.0259040371 * light + 0.7827717662 * medium - 0.808675766 * short;
  const chroma = Math.hypot(a, b);
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;

  if (chroma < NEUTRAL_CHROMA_THRESHOLD) return { hue: 0, chroma: 0 };

  return { hue, chroma };
}

function toHexChannel(linear: number): string {
  const channel = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  const clamped = Math.max(0, Math.min(1, channel));

  return Math.round(clamped * MAX_RGB_CHANNEL)
    .toString(16)
    .padStart(2, "0");
}

export function accentToHex(value: AccentColor): `#${string}` {
  if (typeof value === "string") return value.toLowerCase() as `#${string}`;

  const radians = (value * Math.PI) / 180;
  const a = DEFAULT_ACCENT_CHROMA * Math.cos(radians);
  const b = DEFAULT_ACCENT_CHROMA * Math.sin(radians);
  const light = (ACCENT_SWATCH_LIGHTNESS + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (ACCENT_SWATCH_LIGHTNESS - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (ACCENT_SWATCH_LIGHTNESS - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const channels = [
    4.0767416621 * light - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * light + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * light - 0.7034186147 * medium + 1.707614701 * short,
  ].map(toHexChannel);

  return `#${channels.join("")}`;
}
