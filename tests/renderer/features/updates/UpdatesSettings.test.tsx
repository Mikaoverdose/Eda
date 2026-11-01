import { act } from "react";
import { createRoot } from "react-dom/client";
import { UpdatesSettings } from "@renderer/features/updates/UpdatesSettings";
import { usePreferencesStore } from "@renderer/stores/preferences-store";
import { builtInSetting, type SettingKey } from "@shared/preferences/settings";
import type { UpdateState } from "@shared/updates";

it("defaults to pre-release updates, saves an opt-out and prevents changes during a transfer", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  let includePrereleases = true;
  let deliver!: (state: UpdateState) => void;

  const state: UpdateState = {
    revision: 0,
    capability: "automatic",
    reason: null,
    phase: "idle",
    feedUrl: null,
    checkedAt: null,
    release: null,
    progress: null,
    error: null,
  };

  vi.stubGlobal("eda", {
    settings: {
      resolve: vi.fn(async (key: SettingKey) => ({
        ok: true,
        value:
          key === "includePrereleaseUpdates"
            ? { ...builtInSetting(key), value: includePrereleases }
            : builtInSetting(key),
      })),
    },
    updates: { state: async () => ({ ok: true, value: state }) },
    events: {
      onUpdateChanged: (listener: typeof deliver) => {
        deliver = listener;

        return () => {};
      },
    },
  });

  const previous = usePreferencesStore.getState();
  const save = vi.fn(async (_key: SettingKey, _scope: unknown, value: unknown) => {
    includePrereleases = value === true;

    usePreferencesStore.setState({ values: { ...usePreferencesStore.getState().values } });

    return true;
  });

  usePreferencesStore.setState({ set: save });

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  const checkbox = () =>
    [...container.querySelectorAll("label")]
      .find((label) => label.textContent?.includes("Include pre-release updates"))!
      .querySelector<HTMLInputElement>("input")!;

  try {
    await act(async () => root.render(<UpdatesSettings />));

    expect(checkbox().checked).toBe(true);
    expect(checkbox().disabled).toBe(false);

    await act(async () => checkbox().click());

    expect(save).toHaveBeenCalledWith("includePrereleaseUpdates", { kind: "application" }, false);
    expect(checkbox().checked).toBe(false);

    await act(async () => deliver({ ...state, revision: 1, phase: "downloading" }));

    expect(checkbox().disabled).toBe(true);

    await act(async () => checkbox().click());

    expect(save).toHaveBeenCalledOnce();

    await act(async () => deliver({ ...state, revision: 2 }));
    await act(async () => checkbox().click());

    expect(save).toHaveBeenLastCalledWith(
      "includePrereleaseUpdates",
      { kind: "application" },
      true,
    );
    expect(checkbox().checked).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    usePreferencesStore.setState(previous);
    vi.unstubAllGlobals();
  }
});
