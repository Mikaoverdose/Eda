import { beforeEach, describe, expect, it } from "vitest";
import { applyIdentityHue, applyTheme, type Theme } from "@renderer/styles/themes";

const custom: Theme = {
  id: "custom",
  name: "Custom",
  appearance: "dark",
  tokens: { "bg-base": "#123456" },
  preview: { background: "#123456", surface: "#123456", accent: "#123456" },
};

const fallback: Theme = { ...custom, id: "fallback", appearance: "light", tokens: {} };

describe("theme switching", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-appearance");
  });

  it("removes old overrides and selects the new fallback appearance", () => {
    applyTheme(custom);
    expect(document.documentElement.style.getPropertyValue("--bg-base")).not.toBe("");
    applyTheme(fallback);
    expect(document.documentElement.style.getPropertyValue("--bg-base")).toBe("");
    expect(document.documentElement.dataset["appearance"]).toBe("light");
    expect(document.documentElement.dataset["theme"]).toBe("fallback");
  });

  it("preserves the active profile accent across theme switches", () => {
    applyIdentityHue("#808080");
    applyTheme(custom);
    applyTheme(fallback);
    expect(document.documentElement.style.getPropertyValue("--identity-chroma")).toBe("0");

    applyIdentityHue(150);
    expect(document.documentElement.style.getPropertyValue("--identity-hue")).toBe("150");
    expect(
      Number(document.documentElement.style.getPropertyValue("--identity-chroma")),
    ).toBeGreaterThan(0);
  });
});
