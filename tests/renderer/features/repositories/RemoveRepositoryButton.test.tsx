import { act } from "react";
import { createRoot } from "react-dom/client";
import type { RepositorySummary } from "@shared/repository/repository";
import { RemoveRepositoryButton } from "@renderer/features/repositories/RemoveRepositoryButton";
import { useAppStore } from "@renderer/stores/app-store";
import { useSessionStore } from "@renderer/stores/session-store";

it("requires confirmation and preserves the repository when session saving fails", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const container = document.createElement("div");

  document.body.append(container);

  const root = createRoot(container);
  const repository = {
    id: "repo",
    name: "Eda",
    path: "/repos/eda",
    available: true,
  } as RepositorySummary;

  const remove = vi.fn();

  vi.stubGlobal("eda", { repository: { remove } });

  const flush = vi.spyOn(useSessionStore.getState(), "flush").mockResolvedValue(false);
  const previous = useAppStore.getState().repositories;

  useAppStore.setState({ repositories: [repository] });

  const click = async (label: string) => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (item) => item.textContent === label,
    )!;
    expect(button).toBeTruthy();
    await act(async () => button.click());
  };

  try {
    await act(async () => root.render(<RemoveRepositoryButton repository={repository} />));
    await click("Remove from profile...");
    expect(remove).not.toHaveBeenCalled();

    await click("Cancel");
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await click("Remove from profile...");
    await click("Remove from profile");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Could not save");
    expect(remove).not.toHaveBeenCalled();
    expect(useAppStore.getState().repositories).toEqual([repository]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    flush.mockRestore();
    useAppStore.setState({ repositories: previous });
    vi.unstubAllGlobals();
  }
});
