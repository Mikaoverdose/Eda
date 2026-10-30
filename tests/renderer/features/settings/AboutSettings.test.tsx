import { act } from "react";
import { createRoot } from "react-dom/client";
import { AboutSettings } from "@renderer/features/settings/application/AboutSettings";
import { builtInSetting } from "@shared/preferences/settings";

it("keeps build identity and maintainer contact available when Gravatar is unavailable", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const version = {
    version: "0.0.1",
    displayVersion: "0.0.1-abcdef123456-dirty",
    commit: "abcdef123456".padEnd(40, "0"),
    dirty: true,
  };
  const copyText = vi.fn(async () => ({ ok: true, value: undefined }));
  const get = vi.fn(async () => {
    throw new Error("Offline");
  });
  const updates = {
    state: vi.fn(async () => ({
      ok: true,
      value: {
        revision: 0,
        capability: "development",
        phase: "idle",
        reason: "Development builds are never replaced.",
        feedUrl: null,
        checkedAt: null,
        release: null,
        progress: null,
        error: null,
      },
    })),
  };
  const events = { onUpdateChanged: vi.fn(() => () => {}) };
  const settings = {
    resolve: vi.fn(async () => ({ ok: true, value: builtInSetting("automaticUpdateChecks") })),
  };
  vi.stubGlobal("eda", { app: { version, copyText }, avatars: { get }, updates, events, settings });

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () => root.render(<AboutSettings />));
    expect(container.textContent).toContain(version.displayVersion);
    expect(container.textContent).toContain(version.commit);
    expect(container.textContent).toContain("Local changes (dirty)");
    expect(get).toHaveBeenCalledWith(["yuzu", "kirameki.cafe"].join("@"));
    expect(container.querySelector(".profile-avatar")?.textContent).toBe("Y");
    expect(container.querySelector("img")).toBeNull();

    const copy = container.querySelector<HTMLButtonElement>('[aria-label="Copy Eda version"]')!;
    await act(async () => copy.click());
    expect(copyText).toHaveBeenCalledWith(version.displayVersion);

    vi.stubGlobal("eda", {
      app: {
        version: { ...version, commit: null, dirty: null, displayVersion: "0.0.1-unknown" },
        copyText,
      },
      avatars: { get },
      updates,
      events,
      settings,
    });
    await act(async () => root.render(<AboutSettings />));
    expect(container.textContent).toContain("0.0.1-unknown");
    expect(container.textContent).toContain("Unknown");
    expect(container.querySelector('[aria-label="Copy build commit"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
