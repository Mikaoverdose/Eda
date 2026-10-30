import { err, ok } from "@shared/errors";
import type { EdaApi } from "@shared/ipc";
import {
  SETTING_DEFINITIONS,
  type ResolvedSetting,
  type SettingKey,
  type SettingsContext,
} from "@shared/preferences/settings";
import {
  usePreferencesStore,
  watchSystemAppearance,
  previewAppearance,
  previewMotion,
  previewBackground,
  previewAccent,
  beginBackgroundAdjustment,
} from "@renderer/stores/preferences-store";

const nordPreference = { mode: "dark", light: "nord-light", dark: "nord" } as const;
const lightPreference = { mode: "light", light: "eda-light", dark: "eda-dark" } as const;

function resolved(key: SettingKey, context: SettingsContext): ResolvedSetting {
  return {
    key,
    value:
      key === "theme"
        ? context.profileId === "work"
          ? nordPreference
          : lightPreference
        : SETTING_DEFINITIONS[key].defaultValue,
    source: { kind: "application" },
    hasOverride: false,
  };
}

const install = (
  resolve: (key: SettingKey, context: SettingsContext) => Promise<unknown>,
  set = async () => ok(undefined),
) =>
  Object.defineProperty(window, "eda", {
    configurable: true,
    value: { settings: { resolve, set, reset: async () => ok(undefined) } } as unknown as EdaApi,
  });

it("rejects late preference responses from a previously visible profile", async () => {
  const pending: (() => void)[] = [];

  install(async (key, context) => {
    if (context.profileId === "work") await new Promise<void>((resolve) => pending.push(resolve));
    return ok(resolved(key, context));
  });

  const previous = usePreferencesStore.getState().load({ profileId: "work" });

  await usePreferencesStore.getState().load({ profileId: "home" });

  for (const finish of pending) finish();

  await previous;
  expect(usePreferencesStore.getState().context.profileId).toBe("home");
  expect(usePreferencesStore.getState().values.theme.value).toEqual(lightPreference);
});

it("does not display a failed preference mutation as saved", async () => {
  install(
    async (key, context) => ok(resolved(key, context)),
    async () => err({ kind: "invalid-input", operation: "test", message: "Cannot save" }),
  );
  await usePreferencesStore.getState().load({ profileId: "home" });

  const saved = await usePreferencesStore
    .getState()
    .set("theme", { kind: "profile", profileId: "home" }, nordPreference);

  expect(saved).toBe(false);
  expect(usePreferencesStore.getState().values.theme.value).toEqual(lightPreference);
  expect(usePreferencesStore.getState().error?.message).toBe("Cannot save");
});

it("follows OS changes only in system mode and releases the listener", async () => {
  const previous = usePreferencesStore.getState();
  const media = new EventTarget();
  let dark = false;

  Object.defineProperty(media, "matches", { get: () => dark });

  const matchMedia = vi.spyOn(window, "matchMedia").mockReturnValue(media as MediaQueryList);
  let preference = { mode: "system" as "system" | "light", light: "eda-light", dark: "nord" };

  install(async (key, context) =>
    ok(key === "theme" ? { ...resolved(key, context), value: preference } : resolved(key, context)),
  );

  const stop = watchSystemAppearance();

  try {
    await usePreferencesStore.getState().load({ profileId: "system-preview" });
    expect(document.documentElement.dataset["theme"]).toBe("eda-light");

    dark = true;
    media.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset["theme"]).toBe("nord");

    preference = { ...preference, mode: "light" };
    await usePreferencesStore.getState().load({ profileId: "system-preview" });
    media.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset["theme"]).toBe("eda-light");

    stop();
    preference = { ...preference, mode: "system" };
    await usePreferencesStore.getState().load({ profileId: "system-preview" });
    dark = false;
    media.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset["theme"]).toBe("nord");
  } finally {
    stop();
    matchMedia.mockRestore();
    usePreferencesStore.setState(previous);
  }
});

it("keeps a global appearance preview visible across reloads and restores the workspace override", async () => {
  const saved = usePreferencesStore.getState();

  install(async (key, context) => ok(resolved(key, context)));

  try {
    await usePreferencesStore.getState().load({ profileId: "work" });
    expect(document.documentElement.dataset["theme"]).toBe("nord");

    previewAppearance({ mode: "light", light: "lavender-light", dark: "lavender-dark" });
    previewMotion(true);
    previewAccent("#bd6b9a");

    const customHue = document.documentElement.style.getPropertyValue("--identity-hue");

    expect(document.documentElement.dataset["reducedMotion"]).toBe("true");
    expect(document.documentElement.dataset["theme"]).toBe("lavender-light");
    expect(document.documentElement.dataset["appearance"]).toBe("light");

    await usePreferencesStore.getState().load({ profileId: "work" });
    expect(document.documentElement.style.getPropertyValue("--identity-hue")).toBe(customHue);
    expect(document.documentElement.dataset["theme"]).toBe("lavender-light");
    expect(usePreferencesStore.getState().values.theme.value).toEqual(nordPreference);
    expect(document.documentElement.dataset["reducedMotion"]).toBe("true");

    previewBackground({ image: "data:image/jpeg;base64,/9j/", strength: 20, blur: 4 });
    await usePreferencesStore.getState().load({ profileId: "work" });
    expect(document.documentElement.dataset["customBackground"]).toBe("true");
    expect(document.documentElement.style.getPropertyValue("--background-blur")).toBe("4px");

    previewBackground(null);
    expect(document.documentElement.dataset["customBackground"]).toBe("false");

    previewMotion(null);
    expect(document.documentElement.dataset["reducedMotion"]).toBe(
      String(usePreferencesStore.getState().values.reducedMotion.value),
    );

    previewAppearance(null);
    previewAccent(null);
    expect(document.documentElement.style.getPropertyValue("--identity-hue")).toBe("210");
    expect(document.documentElement.dataset["theme"]).toBe("nord");
    expect(document.documentElement.dataset["appearance"]).toBe("dark");
  } finally {
    previewAppearance(null);
    previewMotion(null);
    previewBackground(null);
    previewAccent(null);
    usePreferencesStore.setState(saved);
  }
});

it("keeps live background edits above saved previews and ignores stale cleanup", () => {
  const first = beginBackgroundAdjustment();

  first.update({ image: "", strength: 30, blur: 7 });
  previewBackground({ image: "", strength: 10, blur: 2 });
  expect(document.documentElement.style.getPropertyValue("--background-blur")).toBe("7px");

  const second = beginBackgroundAdjustment();

  second.update({ image: "", strength: 40, blur: 12 });
  first.clear();
  expect(document.documentElement.style.getPropertyValue("--background-blur")).toBe("12px");

  second.clear();
  expect(document.documentElement.style.getPropertyValue("--background-blur")).toBe("2px");

  previewBackground(null);
});
