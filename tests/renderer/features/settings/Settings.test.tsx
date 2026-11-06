import { act } from "react";
import { createRoot } from "react-dom/client";
import { Settings } from "@renderer/features/settings/Settings";
import { usePreferencesStore } from "@renderer/stores/preferences-store";

vi.mock("@renderer/features/settings/application/AboutSettings", () => ({
  AboutSettings: () => <div>About Eda</div>,
}));

it("mounts only the selected settings panel without starting unrelated IPC work", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const unexpectedIpc = vi.fn(() => {
    throw new Error("An inactive settings panel requested IPC");
  });
  vi.stubGlobal("eda", new Proxy({}, { get: unexpectedIpc }));
  const previous = usePreferencesStore.getState();
  usePreferencesStore.setState({
    values: {
      ...previous.values,
      developerSettingsEnabled: { ...previous.values.developerSettingsEnabled, value: true },
    },
  });
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
    usePreferencesStore.setState(previous);
    vi.unstubAllGlobals();
  }
});

it("gates debug navigation, search, and direct selection behind developer settings", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const previous = usePreferencesStore.getState();
  const onSelect = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const enable = (value: boolean) =>
    usePreferencesStore.setState({
      values: {
        ...previous.values,
        developerSettingsEnabled: { ...previous.values.developerSettingsEnabled, value },
      },
    });

  try {
    enable(false);
    for (const selected of ["debug", "debug-states", "debug-failures", "debug-reset"] as const) {
      onSelect.mockClear();
      await act(async () => root.render(<Settings selected={selected} onSelect={onSelect} />));
      expect(container.querySelector("#settings-about")).not.toBeNull();
      expect(container.querySelector("[id^='settings-debug']")).toBeNull();
      expect(container.querySelector("[aria-controls^='settings-debug']")).toBeNull();
      expect(onSelect).toHaveBeenCalledWith("about");
      await act(async () => root.render(<Settings selected="about" onSelect={onSelect} />));
    }

    const search = container.querySelector<HTMLInputElement>('[aria-label="Search settings"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        search,
        "resilience",
      );
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector("[aria-controls='settings-debug-failures']")).toBeNull();
    expect(container.textContent).toContain("No settings match");

    await act(async () => enable(true));
    expect(container.querySelector("[aria-controls='settings-debug-failures']")).not.toBeNull();

    await act(async () => root.render(<Settings selected="debug-failures" onSelect={onSelect} />));
    expect(container.querySelector("#settings-debug-failures")).not.toBeNull();
    onSelect.mockClear();
    await act(async () => enable(false));
    expect(container.querySelector("#settings-debug-failures")).toBeNull();
    expect(container.querySelector("#settings-about")).not.toBeNull();
    expect(onSelect).toHaveBeenCalledWith("about");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    usePreferencesStore.setState(previous);
    vi.unstubAllGlobals();
  }
});
