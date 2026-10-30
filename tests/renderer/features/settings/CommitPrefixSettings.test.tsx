import { act } from "react";
import { createRoot } from "react-dom/client";
import { builtInSetting } from "@shared/preferences/settings";
import { defaultCommitPrefixes } from "@shared/preferences/commit-prefix";
import { CommitPrefixSettings } from "@renderer/features/settings/git/CommitPrefixSettings";
import { usePreferencesStore } from "@renderer/stores/preferences-store";

it("asks for emoji style before resetting prefixes and leaves enablement alone", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("eda", {
    settings: {
      resolve: vi.fn(async (key: "commitPrefixes" | "conventionalCommitsEnabled") => ({
        ok: true,
        value: builtInSetting(key),
      })),
    },
  });

  const previous = usePreferencesStore.getState();
  const save = vi.fn(async () => true);

  usePreferencesStore.setState({ set: save });

  const container = document.createElement("div");

  document.body.append(container);

  const root = createRoot(container);
  const button = (text: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (item) => item.textContent === text,
    )!;

  try {
    await act(async () => root.render(<CommitPrefixSettings scope={{ kind: "application" }} />));
    expect(container.textContent).not.toContain("Reset enablement");

    const reset = container.querySelector<HTMLButtonElement>(
      '[aria-label="Reset commit prefixes"]',
    )!;

    await act(async () => reset.click());
    expect(save).not.toHaveBeenCalled();

    await act(async () => button("Cancel").click());
    expect(save).not.toHaveBeenCalled();

    for (const emojis of [true, false]) {
      await act(async () => reset.click());
      await act(async () => button(emojis ? "With emojis" : "Without emojis").click());
      expect(save).toHaveBeenLastCalledWith(
        "commitPrefixes",
        { kind: "application" },
        defaultCommitPrefixes(emojis),
      );
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    }
  } finally {
    await act(async () => root.unmount());
    container.remove();
    usePreferencesStore.setState(previous);
    vi.unstubAllGlobals();
  }
});
