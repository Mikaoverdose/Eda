import { describe, expect, it } from "vitest";
import { accentComponents, accentToHex, isHexColor } from "@shared/preferences/accent";

describe("accent colors", () => {
  it("keeps hue presets at the default chroma", () => {
    expect(accentComponents(210.4)).toEqual({ hue: 210, chroma: 0.14 });
  });

  it.each(["#000000", "#ffffff", "#808080", "#010101", "#fafafa"] as const)(
    "keeps %s neutral instead of assigning it an arbitrary hue",
    (color) => {
      expect(accentComponents(color)).toEqual({ hue: 0, chroma: 0 });
    },
  );

  it.each([
    ["#ff0000", 29.2339, 0.2576833],
    ["#00ff00", 142.4953, 0.2948272],
    ["#0000ff", 264.052, 0.3132144],
    ["#112233", 249.7316186, 0.039848312],
    ["#5566ff", 272.5227202, 0.225225018],
    ["#eeffee", 145.3536248, 0.028574851],
    ["#ff00ff", 328.3634152, 0.322490988],
    ["#ffaa77", 51.3030566, 0.120375581],
    ["#ffff00", 109.7692361, 0.211005874],
  ] as const)("extracts the OKLCH hue and chroma from %s", (color, hue, chroma) => {
    const actual = accentComponents(color);
    expect(actual.hue).toBeCloseTo(hue, 3);
    expect(actual.chroma).toBeCloseTo(chroma, 6);
  });

  it.each([
    [0, "#c85e83"],
    [30, "#cd6151"],
    [60, "#c26e12"],
    [120, "#7c9217"],
    [180, "#00a089"],
    [240, "#0a8fd1"],
    [300, "#9470cd"],
    [360, "#c85e83"],
  ] as const)("preserves the native picker swatch for hue %s", (hue, hex) => {
    expect(accentToHex(hue)).toBe(hex);
  });

  it("normalizes custom hex colors without changing their channels", () => {
    expect(accentToHex("#ABCDEF")).toBe("#abcdef");
  });

  it("wraps hue angles and clamps out-of-gamut channels", () => {
    expect(accentToHex(-120)).toBe(accentToHex(240));
    expect(accentToHex(720)).toBe(accentToHex(0));
    expect(accentToHex(180)).toBe("#00a089");
  });

  it("accepts only opaque six-digit hex colors", () => {
    expect(isHexColor("#ABCDEF")).toBe(true);
    for (const value of ["#fff", "#ffffffff", "abcdef", "red", "#gg0000", null, 210])
      expect(isHexColor(value)).toBe(false);
  });
});
