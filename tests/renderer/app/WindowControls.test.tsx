import { act } from "react";
import { createRoot } from "react-dom/client";
import { WindowTitlebar } from "@renderer/app/WindowControls";
import type { InstallationInfo } from "@shared/application";

it.each<InstallationInfo>([
  { method: "development" },
  { method: "direct" },
  { method: "homebrew" },
  { method: "system-package", manager: "dpkg" },
  { method: "unknown" },
])("labels only development installations in red (%j)", async (installation) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("eda", {
    app: {
      platform: "mac",
      version: { dirty: true },
      installation: async () => ({ ok: true, value: installation }),
    },
  });

  const container = document.createElement("div");
  const root = createRoot(container);

  try {
    await act(async () => root.render(<WindowTitlebar />));

    const title = container.querySelector("header > span")!;

    if (installation.method === "development") {
      expect(title.textContent).toBe("Eda Dev");
      expect(title.querySelector(".text-git-deleted")?.textContent).toBe("Dev");
    } else {
      expect(title.textContent).toBe("Eda");
    }
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("keeps the title available when installation detection fails", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("eda", {
    app: {
      platform: "mac",
      installation: async () => {
        throw new Error("Unavailable");
      },
    },
  });

  const container = document.createElement("div");
  const root = createRoot(container);

  try {
    await act(async () => root.render(<WindowTitlebar />));

    expect(container.querySelector("header > span")?.textContent).toBe("Eda");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
