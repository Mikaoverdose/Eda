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
    app: { version: { displayVersion: "0.0.2-abcdef" } },
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

it("offers one Homebrew action only after the cask is ready and saves the workspace before installing", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { useSessionStore } = await import("@renderer/stores/session-store");
  const flush = vi.spyOn(useSessionStore.getState(), "flush").mockResolvedValue(false);
  let deliver!: (state: UpdateState) => void;
  const state: UpdateState = {
    revision: 0,
    capability: "homebrew",
    reason: "Eda 0.0.2 is not available through Homebrew yet. Check again later.",
    phase: "current",
    feedUrl: null,
    checkedAt: null,
    release: null,
    progress: null,
    error: null,
  };
  const install = vi.fn(async () => ({ ok: true, value: state }));
  const download = vi.fn();
  vi.stubGlobal("eda", {
    app: { version: { displayVersion: "0.0.1" } },
    settings: { resolve: async (key: SettingKey) => ({ ok: true, value: builtInSetting(key) }) },
    updates: { state: async () => ({ ok: true, value: state }), install, download },
    events: {
      onUpdateChanged: (listener: typeof deliver) => {
        deliver = listener;
        return () => {};
      },
    },
  });
  const previous = usePreferencesStore.getState();
  const container = document.createElement("div");
  const root = createRoot(container);
  const action = () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Update with Homebrew"]');

  try {
    await act(async () => root.render(<UpdatesSettings />));
    expect(container.textContent).toContain("not available through Homebrew yet");
    expect(action()).toBeNull();

    await act(async () =>
      deliver({
        ...state,
        revision: 1,
        phase: "available",
        reason: null,
        release: { version: "0.0.2", name: "Eda 0.0.2", notes: null, releasedAt: null },
      }),
    );
    expect(action()).not.toBeNull();
    expect(container.textContent).not.toContain("Download update");
    await act(async () => action()!.click());
    expect(flush).toHaveBeenCalledOnce();
    expect(install).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Save your workspace successfully before restarting");
    await act(async () => vi.runOnlyPendingTimersAsync());

    flush.mockResolvedValue(true);
    await act(async () => action()!.click());
    expect(install).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();

    await act(async () => deliver({ ...state, revision: 2, phase: "installing", reason: null }));
    expect(action()).toBeNull();
    expect(container.textContent).toContain("Updating with Homebrew");
    expect(
      container
        .querySelector('input[aria-label="Include pre-release updates"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
  } finally {
    await act(async () => root.unmount());
    usePreferencesStore.setState(previous);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
