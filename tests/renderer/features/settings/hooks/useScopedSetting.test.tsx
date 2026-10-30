import { act } from "react";
import { createRoot } from "react-dom/client";
import { builtInSetting } from "@shared/preferences/settings";
import { ok } from "@shared/errors";
import { useScopedSetting } from "@renderer/features/settings/hooks/useScopedSetting";

const profile = vi.hoisted(() => ({ id: "first" }));
vi.mock("@renderer/stores/app-store", () => ({
  useAppStore: Object.assign(
    (select: (state: { activeIdentity: { id: string } }) => unknown) =>
      select({ activeIdentity: profile }),
    { getState: () => ({ activeIdentity: profile }) },
  ),
}));

it("clears the previous profile value while loading and after a failed resolve", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let reject!: (reason: Error) => void;
  const resolve = vi
    .fn()
    .mockResolvedValueOnce(
      ok({
        ...builtInSetting("uiZoom"),
        value: 150,
        source: { kind: "profile", profileId: "first" },
      }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
  vi.stubGlobal("eda", { settings: { resolve } });
  const container = document.createElement("div");
  const root = createRoot(container);
  function Example() {
    const setting = useScopedSetting("uiZoom", "profile");
    return <output data-reading={setting.reading}>{setting.resolved.value}</output>;
  }
  try {
    await act(async () => root.render(<Example />));
    expect(container.textContent).toBe("150");
    profile.id = "second";
    await act(async () => root.render(<Example />));
    expect(container.textContent).toBe(String(builtInSetting("uiZoom").value));
    expect(container.querySelector("output")?.dataset["reading"]).toBe("true");
    await act(async () => reject(new Error("offline")));
    expect(container.textContent).toBe(String(builtInSetting("uiZoom").value));
    expect(container.querySelector("output")?.dataset["reading"]).toBe("true");
  } finally {
    await act(async () => root.unmount());
    profile.id = "first";
    vi.unstubAllGlobals();
  }
});

it("keeps scoped preferences disabled and reports a rejected read", async () => {
  const { ScopedPreferences } = await import("@renderer/features/settings/ScopedPreferences");
  const { usePreferencesStore } = await import("@renderer/stores/preferences-store");
  const previous = usePreferencesStore.getState();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("eda", { settings: { resolve: vi.fn().mockRejectedValue(new Error("offline")) } });
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ScopedPreferences owner="profile" section="appearance" />));
    expect(container.querySelector("fieldset")?.getAttribute("aria-busy")).toBe("true");
    expect(usePreferencesStore.getState().error?.message).toBe(
      "Could not read application preferences.",
    );
  } finally {
    await act(async () => root.unmount());
    usePreferencesStore.setState(previous, true);
    vi.unstubAllGlobals();
  }
});
