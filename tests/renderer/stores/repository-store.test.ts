import type { EdaApi } from "@shared/ipc";
import type { HistoryCommit, UnifiedDiff } from "@shared/repository/repository-read";
import type { Result } from "@shared/errors";
import { err, ok } from "@shared/errors";
import { layoutCommitPages } from "@renderer/repository/dag-layout";
import {
  HISTORY_PAGE_SIZE,
  MAX_HISTORY_PAGES,
  categorizeChanges,
  useRepositoryStore,
} from "@renderer/stores/repository-store";

const makeCommit = (index: number): HistoryCommit => ({
  oid: `oid-${index}`,
  parents: [],
  subject: `commit ${index}`,
  body: "",
  decorations: [],
  author: { name: "A", email: "a@example.com", timestamp: "2026-01-01T00:00:00Z" },
  committerTimestamp: "2026-01-01T00:00:00Z",
});

function api(history: EdaApi["repository"]["history"]): EdaApi {
  return {
    repository: {
      status: async () =>
        ok({ branch: { ahead: 0, behind: 0, detached: false, unborn: false }, changes: [] }),
      history,
      workingDiff: async () => ok({ files: [] }),
      commitDiff: async () => ok({ files: [] }),
    },
  } as unknown as EdaApi;
}

describe("repository read store", () => {
  beforeEach(() => useRepositoryStore.getState().clear());

  it("preserves topology after evicting and reloading a page with parallel ancestry", async () => {
    const commits = Array.from({ length: 600 }, (_, index) => ({
      ...makeCommit(index),
      parents: index < 598 ? [`oid-${index + 2}`] : [],
    }));
    const expected = layoutCommitPages([commits]);

    Object.defineProperty(window, "eda", {
      configurable: true,
      value: api(async ({ offset = 0 }) =>
        ok({
          commits: commits.slice(offset, offset + 100),
          nextOffset: offset + 100 < commits.length ? offset + 100 : null,
        }),
      ),
    });
    await useRepositoryStore.getState().open("repo", "identity", true);

    for (let page = 0; page < 4; page++) await useRepositoryStore.getState().loadMore();

    const assertTopology = () => {
      const state = useRepositoryStore.getState();
      const rows = layoutCommitPages(
        state.pages.map((page) => page.commits),
        state.dagBoundary,
      );
      expect(rows).toEqual(expected.slice(state.baseOffset, state.baseOffset + rows.length));
    };

    assertTopology();
    await useRepositoryStore.getState().loadPrevious();
    assertTopology();
  });

  it("keeps working changes available when only history fails", async () => {
    Object.defineProperty(window, "eda", {
      configurable: true,
      value: api(async () =>
        err({ kind: "repository-corrupt", operation: "history", message: "Missing object" }),
      ),
    });
    await useRepositoryStore.getState().open("repo", "identity", true);
    expect(useRepositoryStore.getState().phase).toBe("ready");
    expect(useRepositoryStore.getState().status).not.toBeNull();
    expect(useRepositoryStore.getState().historyError?.message).toBe("Missing object");
  });

  it("jumps to an uncached commit with bounded ancestry pages and restores the saved graph on refresh", async () => {
    const read = vi.fn(async ({ refs }: { refs?: string[] }) =>
      ok({ commits: [{ ...makeCommit(0), oid: refs?.[0] ?? "head" }], nextOffset: null }),
    );

    Object.defineProperty(window, "eda", { configurable: true, value: api(read) });
    await useRepositoryStore.getState().open("repo", "identity", true);
    await useRepositoryStore.getState().jumpToCommit("a".repeat(40));
    expect(useRepositoryStore.getState().historyTip).toBe("a".repeat(40));
    expect(useRepositoryStore.getState().pages[0]?.commits[0]?.oid).toBe("a".repeat(40));

    await useRepositoryStore.getState().refresh();
    expect(useRepositoryStore.getState().historyTip).toBeNull();
    expect(useRepositoryStore.getState().pages[0]?.commits[0]?.oid).toBe("head");
  });

  it("keeps bounded back/forward selections and drops the forward branch after a new selection", async () => {
    Object.defineProperty(window, "eda", {
      configurable: true,
      value: api(async () => ok({ commits: [], nextOffset: null })),
    });
    await useRepositoryStore.getState().open("repo", "identity", true);

    for (const oid of ["aaaa", "bbbb", "cccc"])
      await useRepositoryStore.getState().selectCommit(oid);

    await useRepositoryStore.getState().navigate(-1);
    expect(useRepositoryStore.getState().selection).toEqual({ kind: "commit", oid: "bbbb" });

    await useRepositoryStore.getState().navigate(1);
    expect(useRepositoryStore.getState().selection).toEqual({ kind: "commit", oid: "cccc" });

    await useRepositoryStore.getState().navigate(-1);
    await useRepositoryStore.getState().selectCommit("dddd");
    expect(useRepositoryStore.getState().navigation).toEqual(
      ["aaaa", "bbbb", "dddd"].map((oid) => ({ kind: "commit", oid })),
    );

    await useRepositoryStore.getState().open("other", "other-profile", true);
    expect(useRepositoryStore.getState().navigation).toEqual([]);
  });

  it("loads selected commit files with independent budgets and rejects stale file and profile responses", async () => {
    const summaries: UnifiedDiff = {
      files: [
        { newPath: "late.ts", status: "added", binary: false, hunks: [], truncated: true },
        { oldPath: "old.ts", newPath: "new.ts", status: "renamed", binary: false, hunks: [] },
      ],
    };

    const preview = (path: string, content: string): UnifiedDiff => ({
      files: [
        {
          newPath: path,
          status: "added",
          binary: false,
          hunks: [
            {
              oldStart: 0,
              oldLines: 0,
              newStart: 1,
              newLines: 1,
              heading: "",
              lines: [{ type: "addition", content, newLineNumber: 1 }],
            },
          ],
        },
      ],
    });

    const requests: { paths: string[]; finish: (result: Result<UnifiedDiff>) => void }[] = [];
    const bridge = api(async () => ok({ commits: [], nextOffset: null }));

    bridge.repository.commitDiff = async ({ paths }) => {
      if (!paths) return ok(summaries);
      return new Promise((finish) => requests.push({ paths, finish }));
    };
    Object.defineProperty(window, "eda", { configurable: true, value: bridge });

    const store = useRepositoryStore.getState();

    await store.open("repo", "profile", true);
    await store.selectCommit("commit-a");

    const late = store.selectCommitFile("late.ts");

    expect(requests[0]!.paths).toEqual(["late.ts"]);

    const renamed = store.selectCommitFile("new.ts");

    expect(requests[1]!.paths).toEqual(["new.ts", "old.ts"]);

    requests[1]!.finish(ok(preview("new.ts", "renamed content")));
    await renamed;
    requests[0]!.finish(
      err({ kind: "repository-corrupt", operation: "commit diff", message: "stale failure" }),
    );
    await late;
    expect(useRepositoryStore.getState()).toMatchObject({
      commitFilePath: "new.ts",
      commitFileDiff: preview("new.ts", "renamed content"),
      commitFileError: null,
      commitFileLoading: false,
      diff: summaries,
    });

    const small = store.selectCommitFile("late.ts");

    requests[2]!.finish(ok(preview("late.ts", "complete small file")));
    await small;
    expect(useRepositoryStore.getState().commitFileDiff).toMatchObject(
      preview("late.ts", "complete small file"),
    );

    const oldCommit = store.selectCommitFile("late.ts");

    await store.selectCommit("commit-b");
    requests[3]!.finish(ok(preview("late.ts", "old commit")));
    await oldCommit;
    expect(useRepositoryStore.getState()).toMatchObject({
      selection: { oid: "commit-b" },
      commitFileDiff: null,
    });

    const oldProfile = store.selectCommitFile("late.ts");

    await store.open("other-repo", "other-profile", true);
    requests[4]!.finish(ok(preview("late.ts", "old profile")));
    await oldProfile;
    expect(useRepositoryStore.getState()).toMatchObject({
      repositoryId: "other-repo",
      identityId: "other-profile",
      commitFileDiff: null,
      commitFileLoading: false,
    });
  });

  it("discards stale repository results", async () => {
    let release:
      | ((value: ReturnType<typeof ok<{ commits: HistoryCommit[]; nextOffset: null }>>) => void)
      | undefined;
    const first = new Promise<
      ReturnType<typeof ok<{ commits: HistoryCommit[]; nextOffset: null }>>
    >((resolve) => {
      release = resolve;
    });

    Object.defineProperty(window, "eda", {
      configurable: true,
      value: api(async ({ repositoryId }) =>
        repositoryId === "old" ? first : ok({ commits: [makeCommit(2)], nextOffset: null }),
      ),
    });

    const oldLoad = useRepositoryStore.getState().open("old", "identity", true);

    await useRepositoryStore.getState().open("new", "identity", true);
    release?.(ok({ commits: [makeCommit(1)], nextOffset: null }));
    await oldLoad;
    expect(useRepositoryStore.getState().repositoryId).toBe("new");
    expect(useRepositoryStore.getState().pages[0]?.commits[0]?.oid).toBe("oid-2");
  });

  it("coalesces page loads and slides through history while retaining at most three pages", async () => {
    let calls = 0;

    Object.defineProperty(window, "eda", {
      configurable: true,
      value: api(async ({ offset = 0 }) => {
        calls += 1;
        return ok({
          commits: Array.from({ length: HISTORY_PAGE_SIZE + 20 }, (_, i) => makeCommit(offset + i)),
          nextOffset: offset + HISTORY_PAGE_SIZE,
        });
      }),
    });
    await useRepositoryStore.getState().open("repo", "identity", true);
    await Promise.all([
      useRepositoryStore.getState().loadMore(),
      useRepositoryStore.getState().loadMore(),
    ]);
    await useRepositoryStore.getState().loadMore();
    await useRepositoryStore.getState().loadMore();
    await useRepositoryStore.getState().loadMore();

    const state = useRepositoryStore.getState();

    expect(calls).toBe(MAX_HISTORY_PAGES + 2);
    expect(state.pages).toHaveLength(MAX_HISTORY_PAGES);
    expect(state.pages.flatMap((page) => page.commits)).toHaveLength(
      MAX_HISTORY_PAGES * HISTORY_PAGE_SIZE,
    );
    expect(state.baseOffset).toBe(HISTORY_PAGE_SIZE * 2);
    expect(state.nextOffset).toBe(HISTORY_PAGE_SIZE * 5);

    await useRepositoryStore.getState().loadPrevious();
    expect(useRepositoryStore.getState().baseOffset).toBe(HISTORY_PAGE_SIZE);
    expect(useRepositoryStore.getState().pages).toHaveLength(MAX_HISTORY_PAGES);
  });

  it("keeps a history paging failure out of the diff surface", async () => {
    Object.defineProperty(window, "eda", {
      configurable: true,
      value: api(async ({ offset = 0 }) =>
        offset === 0
          ? ok({ commits: [makeCommit(0)], nextOffset: HISTORY_PAGE_SIZE })
          : err({
              kind: "unknown",
              operation: "read history",
              message: "paging blew up",
              suggestedAction: "retry",
            }),
      ),
    });
    await useRepositoryStore.getState().open("repo", "identity", true);
    await useRepositoryStore.getState().selectCommit("oid-0");
    await useRepositoryStore.getState().loadMore();

    const state = useRepositoryStore.getState();

    expect(state.historyError?.message).toBe("paging blew up");
    expect(state.error).toBeNull();
    expect(state.diff).not.toBeNull();
  });

  it("re-reads status from Git after a write instead of patching cached state", async () => {
    let staged = false;

    Object.defineProperty(window, "eda", {
      configurable: true,
      value: {
        repository: {
          status: async () =>
            ok({
              branch: { ahead: 0, behind: 0, detached: false, unborn: false },
              changes: staged
                ? [
                    {
                      kind: "ordinary" as const,
                      path: "a",
                      index: "M" as const,
                      worktree: "." as const,
                      submodule: "N...",
                    },
                  ]
                : [
                    {
                      kind: "ordinary" as const,
                      path: "a",
                      index: "." as const,
                      worktree: "M" as const,
                      submodule: "N...",
                    },
                  ],
            }),
          history: async () => ok({ commits: [makeCommit(0)], nextOffset: null }),
          workingDiff: async () => ok({ files: [] }),
          commitDiff: async () => ok({ files: [] }),
          stage: async () => {
            staged = true;
            return ok(undefined);
          },
        },
      } as unknown as EdaApi,
    });

    await useRepositoryStore.getState().open("repo", "identity", true);
    expect(useRepositoryStore.getState().status?.changes[0]?.index).toBe(".");

    await useRepositoryStore.getState().stage(["a"]);
    expect(useRepositoryStore.getState().status?.changes[0]?.index).toBe("M");
    expect(useRepositoryStore.getState().writing).toBe(false);
  });

  it("surfaces a failed write without refreshing", async () => {
    const failure = {
      kind: "identity-mismatch" as const,
      operation: "commit",
      message: "wrong identity",
      suggestedAction: "fix it",
    };

    Object.defineProperty(window, "eda", {
      configurable: true,
      value: {
        repository: {
          status: async () =>
            ok({ branch: { ahead: 0, behind: 0, detached: false, unborn: false }, changes: [] }),
          history: async () => ok({ commits: [], nextOffset: null }),
          workingDiff: async () => ok({ files: [] }),
          commitDiff: async () => ok({ files: [] }),
          commit: async () => err(failure),
        },
      } as unknown as EdaApi,
    });

    await useRepositoryStore.getState().open("repo", "identity", true);

    const committed = await useRepositoryStore.getState().commit("feat: nope");

    expect(committed).toBe(false);
    expect(useRepositoryStore.getState().writeError?.kind).toBe("identity-mismatch");
    expect(useRepositoryStore.getState().writing).toBe(false);
  });

  it("previews the next file in the same area after staging the selected one", async () => {
    const unstaged = (path: string) => ({
      kind: "ordinary" as const,
      path,
      index: "." as const,
      worktree: "M" as const,
      submodule: "N...",
    });

    let staged = false;

    Object.defineProperty(window, "eda", {
      configurable: true,
      value: {
        repository: {
          status: async () =>
            ok({
              branch: { ahead: 0, behind: 0, detached: false, unborn: false },
              changes: staged
                ? [unstaged("b.ts"), unstaged("c.ts")]
                : [unstaged("a.ts"), unstaged("b.ts"), unstaged("c.ts")],
            }),
          history: async () => ok({ commits: [], nextOffset: null }),
          workingDiff: async () => ok({ files: [] }),
          commitDiff: async () => ok({ files: [] }),
          stage: async () => {
            staged = true;
            return ok(undefined);
          },
        },
      } as unknown as EdaApi,
    });

    await useRepositoryStore.getState().open("repo", "identity", true);
    await useRepositoryStore.getState().selectChange(unstaged("a.ts"), "unstaged");
    await useRepositoryStore.getState().stage(["a.ts"]);

    const selection = useRepositoryStore.getState().selection;

    expect(selection).toMatchObject({ kind: "change", path: "b.ts", area: "unstaged" });
  });

  it("clears the preview when the staged file was the last one in its area", async () => {
    const unstaged = (path: string) => ({
      kind: "ordinary" as const,
      path,
      index: "." as const,
      worktree: "M" as const,
      submodule: "N...",
    });

    let staged = false;

    Object.defineProperty(window, "eda", {
      configurable: true,
      value: {
        repository: {
          status: async () =>
            ok({
              branch: { ahead: 0, behind: 0, detached: false, unborn: false },
              changes: staged ? [] : [unstaged("only.ts")],
            }),
          history: async () => ok({ commits: [], nextOffset: null }),
          workingDiff: async () => ok({ files: [] }),
          commitDiff: async () => ok({ files: [] }),
          stage: async () => {
            staged = true;
            return ok(undefined);
          },
        },
      } as unknown as EdaApi,
    });

    await useRepositoryStore.getState().open("repo", "identity", true);
    await useRepositoryStore.getState().selectChange(unstaged("only.ts"), "unstaged");
    await useRepositoryStore.getState().stage(["only.ts"]);

    expect(useRepositoryStore.getState().selection).toBeNull();
  });

  it("categorizes dual-state files into both correct diff areas", () => {
    const change = {
      kind: "ordinary" as const,
      path: "a",
      index: "M" as const,
      worktree: "M" as const,
      submodule: "N...",
    };

    const categorized = categorizeChanges([
      change,
      { ...change, path: "new", kind: "untracked", index: "?", worktree: "?" },
    ]);

    expect(categorized.staged).toEqual([change]);
    expect(categorized.unstaged).toEqual([change]);
    expect(categorized.untracked).toHaveLength(1);
  });
});
