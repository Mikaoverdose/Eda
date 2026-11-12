import { act } from "react";
import { createRoot } from "react-dom/client";
import { ok } from "@shared/errors";
import { RepositoryHome } from "@renderer/features/repositories/RepositoryHome";
import { useSessionStore } from "@renderer/stores/session-store";
import { useAppStore } from "@renderer/stores/app-store";

it("keeps trust actions out of repository rows and reviews only the repository being edited", async () => {
  const previous = useAppStore.getState();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const reviewTrust = vi.fn(async () => ok(undefined));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("eda", { repository: { reviewTrust } });
  useAppStore.setState({
    repositories: ["first", "second"].map((name) => ({
      id: name,
      identityId: "profile",
      name,
      path: `/repos/${name}`,
      favourite: false,
      available: true,
    })),
  });

  try {
    await act(async () => root.render(<RepositoryHome />));
    expect(container.textContent).not.toMatch(/trust/i);
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Edit second"]')!.click();
    });
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Repository settings");
    const actions = Array.from(dialog.querySelectorAll("button")).filter((button) =>
      button.textContent?.includes("Review trust"),
    );
    expect(actions).toHaveLength(1);
    await act(async () => actions[0]!.click());
    expect(reviewTrust).toHaveBeenCalledExactlyOnceWith("second");
    expect(dialog.querySelector<HTMLInputElement>("input")?.value).toBe("second");
  } finally {
    await act(async () => root.unmount());
    useAppStore.setState(previous, true);
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("removes a missing repository directly from its row only after confirmation", async () => {
  const previous = useAppStore.getState();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const remove = vi.fn(async () => ok(undefined));
  const refreshRepositories = vi.fn(async () => useAppStore.setState({ repositories: [] }));
  const flush = vi.spyOn(useSessionStore.getState(), "flush").mockResolvedValue(true);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("eda", { repository: { remove } });
  useAppStore.setState({
    refreshRepositories,
    repositories: [
      {
        id: "missing",
        identityId: "profile",
        name: "Missing",
        path: "/missing",
        favourite: false,
        available: false,
      },
    ],
  });
  const click = async (label: string) => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (item) => item.textContent === label || item.getAttribute("aria-label") === label,
    )!;
    expect(button).toBeTruthy();
    await act(async () => button.click());
  };
  try {
    await act(async () => root.render(<RepositoryHome />));
    await click("Remove Missing from profile");
    expect(remove).not.toHaveBeenCalled();
    await click("Cancel");
    expect(remove).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await click("Remove Missing from profile");
    await click("Remove from profile");
    expect(remove).toHaveBeenCalledExactlyOnceWith("missing");
    expect(refreshRepositories).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    flush.mockRestore();
    useAppStore.setState(previous, true);
    container.remove();
    vi.unstubAllGlobals();
  }
});
