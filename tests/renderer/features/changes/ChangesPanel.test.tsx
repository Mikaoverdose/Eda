import { act } from "react";
import { createRoot } from "react-dom/client";
import { ChangesPanel } from "@renderer/features/changes/ChangesPanel";
import { useRepositoryStore } from "@renderer/stores/repository-store";
import { useSessionStore } from "@renderer/stores/session-store";

it("targets the right-clicked file, confirms discard, and dismisses menus on repository switches", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const previewDiscard = vi.fn(async () => ({
    ok: true,
    value: {
      token: "review",
      paths: ["file.txt"],
      tracked: 1,
      untracked: 0,
      bytes: 20,
    },
  }));

  const applyDiscard = vi.fn();

  vi.stubGlobal("eda", { repository: { previewDiscard, applyDiscard } });

  const previous = useRepositoryStore.getState();
  const session = useSessionStore.getState();
  const stage = vi.fn();
  const unstage = vi.fn();
  const stash = vi.fn();
  const container = document.createElement("div");

  document.body.append(container);

  const root = createRoot(container);
  const open = async () => {
    const file = container.querySelector('button[aria-label="Unstaged file.txt, status M"]')!;

    expect(file).toBeTruthy();

    await act(async () =>
      file.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 20, clientY: 20 }),
      ),
    );
  };

  const action = (label: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find((item) =>
      item.textContent?.includes(label),
    )!;

  try {
    useSessionStore.setState({ snapshot: null });
    useRepositoryStore.setState({
      repositoryId: "repo",
      identityId: "profile",
      writing: false,
      stage,
      unstage,
      stash,
      status: {
        branch: { ahead: 0, behind: 0, detached: false, unborn: false },
        changes: [
          { path: "file.txt", kind: "ordinary", index: ".", worktree: "M", submodule: "N..." },
        ],
      },
    });
    await act(async () => root.render(<ChangesPanel />));
    await open();
    await act(async () => action("Stage").click());
    expect(stage).toHaveBeenCalledWith(["file.txt"]);

    await open();
    await act(async () => action("Stash file").click());
    expect(stash).toHaveBeenCalledWith(["file.txt"]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await open();
    await act(async () => action("Discard").click());
    expect(previewDiscard).toHaveBeenCalledWith("repo", ["file.txt"]);
    expect(applyDiscard).not.toHaveBeenCalled();

    const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (item) => item.textContent === "Discard selected files",
    )!;

    expect(confirm.disabled).toBe(true);

    const close = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (item) => item.textContent === "Close",
    )!;

    await act(async () => close.click());
    await open();
    await act(async () => useRepositoryStore.setState({ repositoryId: "other" }));
    expect(document.querySelector('[role="menu"]')).toBeNull();

    await act(async () => useRepositoryStore.setState({ repositoryId: "repo" }));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(applyDiscard).not.toHaveBeenCalled();

    await act(async () =>
      useRepositoryStore.setState({
        status: {
          branch: { ahead: 0, behind: 0, detached: false, unborn: false },
          changes: [
            { path: "file.txt", kind: "ordinary", index: "M", worktree: ".", submodule: "N..." },
          ],
        },
      }),
    );

    const stagedFile = container.querySelector('button[aria-label="Staged file.txt, status M"]')!;

    await act(async () =>
      stagedFile.dispatchEvent(
        new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }),
      ),
    );
    expect(action("Discard")).toBeUndefined();
    expect(action("Stash file").disabled).toBe(false);

    await act(async () => action("Unstage").click());
    expect(unstage).toHaveBeenCalledWith(["file.txt"]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    useRepositoryStore.setState(previous);
    useSessionStore.setState(session);
    vi.unstubAllGlobals();
  }
});
