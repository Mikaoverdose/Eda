import { ok, type Result } from "@shared/errors";
import { useRepositoryStore } from "@renderer/stores/repository-store";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { StashList } from "@shared/workflows/stashes";
import { useStashesDialog } from "@renderer/features/stashes/hooks/useStashesDialog";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("ignores a list response from the previously selected repository", async () => {
  const pending = new Map<string, (value: { ok: true; value: StashList }) => void>();

  vi.stubGlobal("eda", {
    stashes: {
      list: (repositoryId: string) =>
        new Promise((resolve) => {
          pending.set(repositoryId, resolve);
        }),
    },
  });

  function View({ repositoryId }: { repositoryId: string }) {
    const { list } = useStashesDialog(repositoryId);
    return <span>{list.truncated ? "new" : "old"}</span>;
  }

  await act(async () => root.render(<View repositoryId="old" />));
  await act(async () => root.render(<View repositoryId="new" />));
  await act(async () =>
    pending.get("new")?.({ ok: true, value: { entries: [], truncated: true } }),
  );
  await act(async () =>
    pending.get("old")?.({ ok: true, value: { entries: [], truncated: false } }),
  );
  expect(container.textContent).toBe("new");
});

const entry = { oid: "a".repeat(40), selector: "stash@{0}", message: "saved", timestamp: 1 };
const inspected = {
  entry,
  token: "preview",
  tracked: {
    files: [
      { status: "added" as const, newPath: "added.txt", binary: false, hunks: [] },
      { status: "deleted" as const, oldPath: "deleted.txt", binary: false, hunks: [] },
    ],
  },
  staged: { files: [] },
  untracked: null,
};
let api: ReturnType<typeof useStashesDialog>;
function Harness({ repositoryId }: { repositoryId: string }) {
  api = useStashesDialog(repositoryId);
  return null;
}
async function setupStashes() {
  const stashes = {
    list: vi.fn().mockResolvedValue({ ok: true, value: { entries: [entry], truncated: false } }),
    inspect: vi.fn().mockResolvedValue({ ok: true, value: inspected }),
    create: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    apply: vi.fn().mockResolvedValue({ ok: true, value: { applied: true, kept: true } }),
  };
  vi.stubGlobal("eda", { stashes });
  vi.spyOn(useRepositoryStore.getState(), "syncFromDisk").mockResolvedValue();
  await act(async () => root.render(<Harness repositoryId="repo" />));
  return stashes;
}

it("offers actual file paths for added and deleted stash files", async () => {
  await setupStashes();
  await act(async () => api.inspect(entry.selector));
  expect(api.restorePaths).toEqual(["added.txt", "deleted.txt"]);
  expect(api.selectedRestorePath).toBe("added.txt");
});

it.each(["list", "inspect", "create", "apply"] as const)(
  "handles a rejected %s request without leaving the dialog busy",
  async (action) => {
    const stashes = await setupStashes();
    if (action === "apply") await act(async () => api.inspect(entry.selector));
    stashes[action].mockRejectedValueOnce(new Error("transport closed"));
    if (action === "list") await act(async () => root.render(<Harness repositoryId="other" />));
    else
      await act(async () => {
        await expect(
          action === "inspect"
            ? api.inspect(entry.selector)
            : action === "create"
              ? api.run("create")
              : api.apply(false),
        ).resolves.toBeUndefined();
      });
    expect(api.error).toBeTruthy();
    expect(api.busy).toBe(false);
  },
);

it("does not create the same stash twice before the busy state renders", async () => {
  const stashes = await setupStashes();
  let finish!: (value: Result<void>) => void;
  stashes.create.mockImplementationOnce(
    () =>
      new Promise<Result<void>>((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => {
    const first = api.run("create");
    const duplicate = api.run("create");
    expect(stashes.create).toHaveBeenCalledOnce();
    finish(ok(undefined));
    await Promise.all([first, duplicate]);
  });
});

it("does not reload the old stash list after the repository changes during refresh", async () => {
  const stashes = await setupStashes();
  let finish!: () => void;
  vi.mocked(useRepositoryStore.getState().syncFromDisk).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  let action!: Promise<void>;
  await act(async () => {
    action = api.run("create");
  });
  await act(async () => root.render(<Harness repositoryId="other" />));
  await act(async () => {
    finish();
    await action;
  });
  expect(stashes.list.mock.calls).toEqual([["repo"], ["other"]]);
});
