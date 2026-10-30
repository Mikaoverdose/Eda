import { afterEach, expect, it, vi } from "vitest";
import { getLocale } from "@shared/i18n";
import { initializeLocalization } from "@renderer/i18n/initialize";

const originalUrl = window.location.href;
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", originalUrl);
});

it("reads the application language and updates document language/direction before rendering", async () => {
  const resolve = vi.fn(async () => ({ ok: true, value: { value: "en" } }));
  vi.stubGlobal("eda", { settings: { resolve } });
  document.documentElement.lang = "ar";
  document.documentElement.dir = "rtl";
  await initializeLocalization();
  expect(resolve).toHaveBeenCalledWith("language", {});
  expect(getLocale()).toBe("en");
  expect(document.documentElement.lang).toBe("en");
  expect(document.documentElement.dir).toBe("ltr");
});

it("keeps failure screens readable when the settings bridge fails", async () => {
  vi.stubGlobal("eda", {
    settings: {
      resolve: vi.fn(async () => {
        throw new Error("bridge unavailable");
      }),
    },
  });
  await expect(initializeLocalization()).resolves.toBeUndefined();
  expect(document.documentElement.lang).toBe("en");
});

it("inherits the tutorial host language without requiring a subframe preload bridge", async () => {
  const resolve = vi.fn();
  vi.stubGlobal("eda", { settings: { resolve } });
  vi.stubGlobal("parent", { document: { documentElement: { lang: "en-GB" } } });
  window.history.replaceState({}, "", "?eda-tour=1");
  await initializeLocalization();
  expect(resolve).not.toHaveBeenCalled();
  expect(document.documentElement.lang).toBe("en");
});
