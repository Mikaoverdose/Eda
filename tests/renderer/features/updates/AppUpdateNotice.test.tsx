import { act } from "react";
import { createRoot } from "react-dom/client";
import { AppUpdateNotice } from "@renderer/features/updates/AppUpdateNotice";
import { useShellStore } from "@renderer/stores/shell-store";
import type { UpdateState } from "@shared/updates";

it.each(["available", "ready"] as const)(
  "shows the target and installed versions with the next step for a %s update",
  async (phase) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

    const previous = useShellStore.getState();
    let deliver!: (state: UpdateState) => void;
    const state: UpdateState = {
      revision: 1,
      capability: "automatic",
      reason: null,
      phase,
      feedUrl: null,
      checkedAt: null,
      release: { version: "1.2.3", name: "Release name", notes: null, releasedAt: null },
      progress: null,
      error: null,
    };

    vi.stubGlobal("eda", {
      app: { version: { version: "1.2.2", displayVersion: "1.2.2-abcdef" } },
      updates: { state: async () => ({ ok: true, value: state }) },
      events: {
        onUpdateChanged: (listener: typeof deliver) => {
          deliver = listener;

          return () => {};
        },
      },
    });

    const container = document.createElement("div");
    const root = createRoot(container);

    try {
      await act(async () => root.render(<AppUpdateNotice aboutOpen={false} />));

      const banner = container.querySelector('aside[aria-label="App update"]')!;

      expect(banner.textContent).toContain("Eda 1.2.3");
      expect(banner.textContent).toContain("Installed: 1.2.2-abcdef");
      expect(banner.textContent?.includes("Downloaded and verified. Restart to install.")).toBe(
        phase === "ready",
      );
      expect(banner.textContent).not.toContain("Review what's new before downloading.");
      expect(banner.textContent).not.toContain("Preview");

      const action = banner.querySelector<HTMLButtonElement>("button")!;

      expect(action.dataset["variant"]).toBe("quiet");

      await act(async () => action.click());

      expect(useShellStore.getState().request).toEqual({ kind: "settings", section: "about" });

      await act(async () => root.render(<AppUpdateNotice aboutOpen />));

      expect(container.querySelector("aside")).toBeNull();

      await act(async () => root.render(<AppUpdateNotice aboutOpen={false} />));
      await act(async () => deliver({ ...state, revision: 2, phase: "current" }));

      expect(container.querySelector("aside")).toBeNull();

      await act(async () => deliver({ ...state, revision: 3, release: null }));

      expect(container.textContent).toContain("An update");
      expect(container.textContent).not.toContain("undefined");
    } finally {
      await act(async () => root.unmount());

      useShellStore.setState(previous);
      vi.unstubAllGlobals();
    }
  },
);
