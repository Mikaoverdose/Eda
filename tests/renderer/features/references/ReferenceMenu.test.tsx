import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ok, err } from "@shared/errors";
import type { BranchSummary } from "@shared/repository/repository-write";
import { emptySession } from "@shared/identity/profile-session";
import { ReferenceMenu } from "@renderer/features/references/ReferenceMenu";
import { ReferenceSidebar } from "@renderer/features/references/ReferenceSidebar";
import { useAppStore } from "@renderer/stores/app-store";
import { useRepositoryStore } from "@renderer/stores/repository-store";
import { useSessionStore } from "@renderer/stores/session-store";

let root: Root;
let container: HTMLDivElement;
const local: BranchSummary = {
  name: "feature/topic",
  oid: "a".repeat(40),
  isHead: false,
  remote: false,
  upstream: "upstream/review/topic",
};
const remote: BranchSummary = {
  name: "upstream/review/topic",
  oid: local.oid,
  isHead: false,
  remote: true,
};
const remotes = [
  {
    name: "upstream",
    fetchUrls: ["https://example.com/repo"],
    pushUrls: ["https://example.com/repo"],
  },
];
const copyText = vi.fn();
const referenceUrl = vi.fn();
const inspect = vi.fn();
const deleteBranch = vi.fn();
const preparePush = vi.fn();
const push = vi.fn();
const renameBranch = vi.fn();
const close = vi.fn();
const refresh = vi.fn();
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent === label,
  )!;
const click = (label: string) => act(async () => button(label).click());
const selectScope = (scope: string) =>
  act(async () => document.querySelector<HTMLInputElement>(`input[value="${scope}"]`)!.click());
const render = (ref = local) =>
  act(async () =>
    root.render(
      <ReferenceMenu
        repositoryId="repo"
        target={{ kind: "branch", ref, x: 100, y: 100 }}
        onClose={close}
      />,
    ),
  );

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useAppStore.setState({
    activeIdentity: { id: "profile" } as never,
    selectedRepositoryId: "repo",
    switchingIdentityId: null,
  });
  refresh.mockReset().mockResolvedValue(undefined);
  useRepositoryStore.setState({
    repositoryId: "repo",
    identityId: "profile",
    phase: "ready",
    writing: false,
    status: null,
    refresh,
    selection: null,
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
  inspect.mockReset().mockResolvedValue(ok({ branches: [local, remote], remotes }));
  deleteBranch.mockReset().mockResolvedValue(ok(undefined));
  preparePush.mockReset().mockResolvedValue(ok({ token: "delete-preview" }));
  push.mockReset().mockResolvedValue(ok("Deleted"));
  renameBranch.mockReset().mockResolvedValue(ok(undefined));
  close.mockReset();
  copyText.mockReset().mockResolvedValue(ok(undefined));
  referenceUrl
    .mockReset()
    .mockResolvedValue(ok("https://github.com/example/repo/tree/feature/topic"));
  vi.stubGlobal("eda", {
    app: { copyText },
    repository: {
      referenceUrl,
      deleteBranch,
      renameBranch,
      listBranches: vi.fn().mockResolvedValue(ok([local, remote])),
      listTags: vi.fn().mockResolvedValue(ok([])),
    },
    remotes: { inspect, preparePush, push },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("opens the shared history menu surface on right-click and keyboard context-menu requests", async () => {
  await act(async () => root.render(<ReferenceSidebar repositoryId="repo" />));
  const row = container.querySelector<HTMLButtonElement>(
    '[aria-label="Inspect branch feature/topic"]',
  )!;
  await act(async () =>
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 50, clientY: 70 })),
  );
  expect(
    document
      .querySelector('[role="menu"][aria-label="Branch actions"]')
      ?.classList.contains("ui-popover-in"),
  ).toBe(true);
  expect(document.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(4);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
    ),
  );
  expect(document.querySelector('[role="menu"]')).toBeNull();
  await act(async () =>
    row.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "F10", shiftKey: true })),
  );
  expect(document.querySelector('[role="menu"][aria-label="Branch actions"]')).not.toBeNull();
});

it.each(["local", "remote", "both"])(
  "deletes the selected %s scope using the tracked destination",
  async (scope) => {
    await render();
    await click("Delete branch...");
    await selectScope(scope);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "upstream/review/topic",
    );
    await click(
      scope === "both"
        ? "Delete local and remote"
        : scope === "local"
          ? "Delete locally"
          : "Delete remotely",
    );
    if (scope !== "remote")
      expect(deleteBranch).toHaveBeenCalledWith({ repositoryId: "repo", name: "feature/topic" });
    else expect(deleteBranch).not.toHaveBeenCalled();
    if (scope !== "local") {
      expect(preparePush).toHaveBeenCalledWith({
        repositoryId: "repo",
        remote: "upstream",
        branch: "review/topic",
        destination: "review/topic",
        mode: "delete",
        setUpstream: false,
      });
      expect(push).toHaveBeenCalledWith("repo", "delete-preview", undefined);
    } else expect(push).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  },
);

it("allows remote deletion for a remote branch and resolves its differently named local branch", async () => {
  await render(remote);
  await click("Delete branch...");
  expect(document.querySelector<HTMLInputElement>('input[value="remote"]')?.checked).toBe(true);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Local: feature/topic");
  await click("Delete remotely");
  expect(push).toHaveBeenCalledOnce();
  expect(deleteBranch).not.toHaveBeenCalled();
});

it.each([
  { ...local, isHead: true },
  { ...local, worktreePath: "/another/worktree" },
])("explains why checked-out branches cannot be deleted locally", async (branch) => {
  inspect.mockResolvedValue(ok({ branches: [branch, remote], remotes }));
  await render(branch);
  await click("Delete branch...");
  expect(document.querySelector<HTMLInputElement>('input[value="local"]')?.disabled).toBe(true);
  expect(document.querySelector<HTMLInputElement>('input[value="both"]')?.disabled).toBe(true);
  expect(document.querySelector('[role="dialog"]')?.textContent).toMatch(/another branch/);
  await click("Delete remotely");
  expect(deleteBranch).not.toHaveBeenCalled();
});

it("retains the local branch if remote deletion fails", async () => {
  push.mockResolvedValue(
    err({ kind: "network-failed", operation: "push", message: "Remote unavailable" }),
  );
  await render();
  await click("Delete branch...");
  await selectScope("both");
  await click("Delete local and remote");
  expect(deleteBranch).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Remote unavailable");
});

it("reports partial completion and retries only the remaining local deletion, with force opt-in", async () => {
  deleteBranch.mockResolvedValueOnce(
    err({ kind: "invalid-input", operation: "delete", message: "Branch is not fully merged" }),
  );
  await render();
  await click("Delete branch...");
  await selectScope("both");
  await click("Delete local and remote");
  expect(document.querySelector('[role="status"]')?.textContent).toContain("Remote branch deleted");
  expect(close).not.toHaveBeenCalled();
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  await click("Delete local and remote");
  expect(push).toHaveBeenCalledOnce();
  expect(deleteBranch).toHaveBeenLastCalledWith({
    repositoryId: "repo",
    name: local.name,
    force: true,
  });
  expect(close).toHaveBeenCalledOnce();
});

it("stops before push when the profile changes during remote preview", async () => {
  preparePush.mockImplementation(async () => {
    useAppStore.setState({ selectedRepositoryId: "other" });
    return ok({ token: "delete-preview" });
  });
  await render();
  await click("Delete branch...");
  await selectScope("both");
  await click("Delete local and remote");
  expect(push).not.toHaveBeenCalled();
  expect(deleteBranch).not.toHaveBeenCalled();
});

it("does not offer remote deletion for an untracked local branch", async () => {
  const branch = { ...local };
  delete branch.upstream;
  inspect.mockResolvedValue(ok({ branches: [branch, remote], remotes }));
  await render(branch);
  await click("Delete branch...");
  expect(document.querySelector<HTMLInputElement>('input[value="remote"]')?.disabled).toBe(true);
  expect(document.querySelector<HTMLInputElement>('input[value="both"]')?.disabled).toBe(true);
});

it("cancels branch deletion with Escape without changing any references", async () => {
  await render();
  await click("Delete branch...");
  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(close).toHaveBeenCalledOnce();
  expect(push).not.toHaveBeenCalled();
  expect(deleteBranch).not.toHaveBeenCalled();
});

it("retains tag checkout, verification, and local deletion in the context menu", async () => {
  await act(async () =>
    root.render(
      <ReferenceMenu
        repositoryId="repo"
        target={{ kind: "tag", ref: { name: "v1", oid: local.oid }, x: 100, y: 100 }}
        onClose={close}
      />,
    ),
  );
  expect(button("Check out tag (detached HEAD)")).toBeDefined();
  expect(button("Verify tag signature...")).toBeDefined();
  await click("Delete tag...");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Remote tags are unaffected",
  );
  expect(document.querySelector('input[type="radio"]')).toBeNull();
});

it("retries HTTPS remote deletion with supplied credentials without deleting locally", async () => {
  preparePush.mockResolvedValueOnce(
    err({ kind: "auth-failed", operation: "delete", message: "Authentication failed" }),
  );
  await render(remote);
  await click("Delete branch...");
  await click("Delete remotely");
  expect(push).not.toHaveBeenCalled();
  await act(async () => {
    const fields = [...document.querySelectorAll<HTMLInputElement>('input:not([type="radio"])')];
    for (const [index, field] of fields.entries()) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        field,
        index === 0 ? "user" : "token",
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await click("Delete remotely");
  const credentials = { username: "user", password: "token" };
  expect(preparePush).toHaveBeenLastCalledWith(expect.objectContaining({ credentials }));
  expect(push).toHaveBeenCalledWith("repo", "delete-preview", credentials);
  expect(deleteBranch).not.toHaveBeenCalled();
});

it.each([
  ["Copy name", local.name],
  ["Copy SHA", local.oid],
  ["Copy browser URL", "https://github.com/example/repo/tree/feature/topic"],
])("copies %s through the native clipboard and closes the menu", async (label, value) => {
  await render();
  await click(label);
  expect(copyText).toHaveBeenCalledExactlyOnceWith(value);
  expect(close).toHaveBeenCalledOnce();
  expect(refresh).not.toHaveBeenCalled();
});

it("shows a dismissible dialog instead of raw clipboard diagnostics in the menu", async () => {
  copyText.mockRejectedValueOnce(new Error("Write permission denied"));
  await render();
  await click("Copy name");
  expect(close).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toBe(
    "Clipboard copy failed",
  );
  expect(document.body.textContent).not.toContain("Write permission denied");
  await click("Dismiss");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("Copy name");
  expect(close).toHaveBeenCalledOnce();
});
