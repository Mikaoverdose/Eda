import { act } from "react";
import { createRoot } from "react-dom/client";
import { Settings } from "@renderer/features/settings/Settings";

it("mounts only the selected settings panel without starting unrelated IPC work", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const unexpectedIpc = vi.fn(() => {
    throw new Error("An inactive settings panel requested IPC");
  });
  vi.stubGlobal("eda", new Proxy({}, { get: unexpectedIpc }));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Settings selected="debug-failures" onSelect={() => {}} />));
    expect(container.querySelectorAll("section[id^='settings-']")).toHaveLength(1);
    expect(container.querySelector("#settings-debug-failures")).not.toBeNull();
    expect(container.querySelector("[aria-current='page']")?.textContent).toBe(
      "Resilience testing",
    );

    await act(async () => root.render(<Settings selected="debug-reset" onSelect={() => {}} />));
    expect(container.querySelectorAll("section[id^='settings-']")).toHaveLength(1);
    expect(container.querySelector("#settings-debug-failures")).toBeNull();
    expect(container.querySelector("#settings-debug-reset")).not.toBeNull();
    expect(unexpectedIpc).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
