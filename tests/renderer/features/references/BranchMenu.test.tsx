import { act } from "react";
import { createRoot } from "react-dom/client";
import { ok } from "@shared/errors";
import { emptySession } from "@shared/identity/profile-session";
import { BranchMenu } from "@renderer/features/references/BranchMenu";
import { useAppStore } from "@renderer/stores/app-store";
import { useRepositoryStore } from "@renderer/stores/repository-store";
import { useSessionStore } from "@renderer/stores/session-store";

it("keeps keyboard checkout within rendered branches and finds omitted branches by search", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const app = useAppStore.getState();
  const repository = useRepositoryStore.getState();
  const session = useSessionStore.getState();
  const branches = Array.from({ length: 205 }, (_, index) => ({
    name: `branch-${index}`,
    oid: "a".repeat(40),
    isHead: false,
    remote: false,
  }));
  const checkoutBranch = vi.fn(async () => ok(undefined));
  vi.stubGlobal("eda", {
    repository: {
      listBranches: vi.fn(async () => ok(branches)),
      checkoutBranch,
    },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    useAppStore.setState({
      activeIdentity: { id: "profile" } as never,
      selectedRepositoryId: "repo",
      switchingIdentityId: null,
    });
    useRepositoryStore.setState({
      repositoryId: "repo",
      identityId: "profile",
      phase: "ready",
      writing: false,
      status: null,
      refresh: vi.fn(async () => {}),
    });
    useSessionStore.setState({
      transitioning: false,
      snapshot: {
        context: { profileId: "profile", windowId: "window", generation: 1 },
        session: emptySession(),
        drafts: {},
        recovery: null,
      },
    });
    await act(async () => root.render(<BranchMenu head="main" />));
    const open = async () =>
      act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    await open();
    let input = container.querySelector<HTMLInputElement>("input")!;
    expect(container.querySelectorAll("li.group\\/branch")).toHaveLength(200);
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })),
    );
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );
    expect(checkoutBranch).toHaveBeenLastCalledWith({ repositoryId: "repo", name: "branch-199" });

    await open();
    input = container.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "branch-204",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll("li.group\\/branch")).toHaveLength(1);
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );
    expect(checkoutBranch).toHaveBeenLastCalledWith({ repositoryId: "repo", name: "branch-204" });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    useAppStore.setState(app, true);
    useRepositoryStore.setState(repository, true);
    useSessionStore.setState(session, true);
    vi.unstubAllGlobals();
  }
});
