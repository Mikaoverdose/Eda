import { createHistoryPagination, type HistoryWindow } from "./history-pagination";
import type { GitErrorData } from "@shared/errors";
import { t } from "@shared/i18n";
import {
  HISTORY_PAGE_SIZE,
  type ChangeArea,
  type HistoryPage,
  type RepositoryChange,
  type RepositoryStatus,
  type UnifiedDiff,
} from "@shared/repository/repository-read";
import type { SavedSelection } from "@shared/identity/profile-session";
import { create } from "zustand";
import type { DagBoundary } from "../repository/dag-layout";

import { boundDiff } from "../repository/diff-model";
import { useLayoutStore } from "./layout-store";
import { useSessionStore } from "./session-store";

export { HISTORY_PAGE_SIZE } from "@shared/repository/repository-read";
export { MAX_HISTORY_PAGES } from "./history-pagination";
export const MAX_STATUS_CHANGES = 5_000;

export type { ChangeArea } from "@shared/repository/repository-read";

export type RepositorySelection = SavedSelection;

interface RepositoryReadState extends HistoryWindow {
  commandDialog: {
    kind:
      | "repository.remotes"
      | "repository.stashes"
      | "repository.references"
      | "repository.graph"
      | "repository.recovery"
      | "repository.historyRecovery"
      | "repository.undoRedo"
      | "repository.createBranch"
      | "repository.createTag";
    oid: string | undefined;
  } | null;
  repositoryId: string | null;
  identityId: string | null;
  phase: "idle" | "loading" | "ready" | "missing" | "error";
  status: RepositoryStatus | null;
  hoveredRefOid: string | null;
  watchWarning: string | null;
  selection: RepositorySelection;
  contentView: "history" | "diff";
  commitFilePath: string | null;
  commitFileDiff: UnifiedDiff | null;
  commitFileLoading: boolean;
  commitFileError: GitErrorData | null;
  selectCommitFile: (path: string) => Promise<void>;
  showHistory: () => void;
  showWorkingTree: () => void;
  navigation: Exclude<RepositorySelection, null>[];
  navigationIndex: number;
  navigate: (direction: -1 | 1) => Promise<void>;
  diff: UnifiedDiff | null;
  diffLoading: boolean;
  error: GitErrorData | null;
  truncatedChanges: boolean;
  generation: number;

  open: (repositoryId: string, identityId: string, available: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  syncFromDisk: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadPrevious: () => Promise<void>;
  selectChange: (change: RepositoryChange, area: ChangeArea) => Promise<void>;
  selectCommit: (oid: string) => Promise<void>;
  jumpToCommit: (oid: string) => Promise<void>;
  clear: () => void;

  stage: (paths?: string[]) => Promise<void>;
  unstage: (paths?: string[]) => Promise<void>;
  applyPartial: (token: string) => Promise<boolean>;
  commit: (
    message: string,
    options?: { amend?: boolean; signOff?: boolean; stagePaths?: string[] },
  ) => Promise<boolean>;
  writing: boolean;
  writeError: GitErrorData | null;
  commitNotice: string | null;
}

let openRequest: Promise<void> | null = null;
let openRequestKey: string | null = null;
let diffRequest: Promise<void> | null = null;
let diffRequestKey: string | null = null;

const emptyState = {
  commandDialog: null,
  historyTip: null,
  repositoryId: null,
  identityId: null,
  phase: "idle" as const,
  status: null,
  pages: [] as HistoryPage[],
  dagBoundary: { lanes: [] } as DagBoundary,
  hoveredRefOid: null,
  watchWarning: null,
  baseOffset: 0,
  nextOffset: null,
  historyLoading: false,
  selection: null,
  contentView: "history" as const,
  commitFilePath: null,
  commitFileDiff: null,
  commitFileLoading: false,
  commitFileError: null,
  navigation: [] as Exclude<RepositorySelection, null>[],
  navigationIndex: -1,
  diff: null,
  diffLoading: false,
  error: null,
  historyError: null,
  truncatedChanges: false,
  writing: false,
  writeError: null,
  commitNotice: null,
};

export const useRepositoryStore = create<RepositoryReadState>((set, get) => {
  let commitFileRevision = 0;
  const history = createHistoryPagination(get, set);

  const load = async (
    repositoryId: string,
    identityId: string,
    available: boolean,
    force = false,
  ): Promise<void> => {
    const key = `${identityId}:${repositoryId}`;

    if (
      !force &&
      get().repositoryId === repositoryId &&
      get().identityId === identityId &&
      get().phase !== "idle" &&
      !(available && get().phase === "missing")
    ) {
      if (openRequestKey === key && openRequest) await openRequest;
      return;
    }

    if (!force && openRequestKey === key && openRequest) return openRequest;

    history.invalidate();
    history.replaceFirst();

    const generation = get().generation + 1;

    diffRequest = null;
    set({
      ...emptyState,
      dagBoundary: history.firstBoundary(repositoryId, null),
      repositoryId,
      identityId,
      generation,
      phase: available ? "loading" : "missing",
    });

    if (!available) return;

    const request = (async () => {
      const [statusResult, historyResult] = await Promise.all([
        window.eda.repository.status(repositoryId),
        window.eda.repository.history({
          repositoryId,
          offset: 0,
          limit: HISTORY_PAGE_SIZE,
          ...history.query(repositoryId),
        }),
      ]);

      if (get().generation !== generation || get().repositoryId !== repositoryId) return;

      if (!statusResult.ok) {
        set({
          phase: statusResult.error.kind === "not-a-repository" ? "missing" : "error",
          error: statusResult.error,
        });
        return;
      }

      if (!historyResult.ok) {
        set({
          phase: "ready",
          status: {
            ...statusResult.value,
            changes: statusResult.value.changes.slice(0, MAX_STATUS_CHANGES),
          },
          historyError: historyResult.error,
        });

        return;
      }

      history.replaceFirst(historyResult.value);

      const changes = statusResult.value.changes.slice(0, MAX_STATUS_CHANGES);

      set({
        phase: "ready",
        status: { ...statusResult.value, changes },
        pages: [
          {
            ...historyResult.value,
            commits: historyResult.value.commits.slice(0, HISTORY_PAGE_SIZE),
          },
        ],
        nextOffset: historyResult.value.nextOffset,
        truncatedChanges: changes.length < statusResult.value.changes.length,
      });

      const session = useSessionStore.getState().snapshot;
      const selection =
        session?.context.profileId === identityId
          ? session.session.views[repositoryId]?.selection
          : null;

      if (selection?.kind === "commit") await loadDiff(selection);
      else if (
        selection?.kind === "change" &&
        categorizeChanges(changes)[selection.area].some((change) => change.path === selection.path)
      )
        await loadDiff(selection);
    })();

    openRequest = request;
    openRequestKey = key;
    await request.finally(() => {
      if (openRequest === request) {
        openRequest = null;
        openRequestKey = null;
      }
    });
  };

  const reloadAfterWrite = async (repositoryId: string): Promise<boolean> => {
    const { generation } = get();
    const revision = history.invalidate();

    const [statusResult, historyResult] = await Promise.all([
      window.eda.repository.status(repositoryId),
      window.eda.repository.history({
        repositoryId,
        offset: 0,
        limit: HISTORY_PAGE_SIZE,
        ...history.query(repositoryId),
      }),
    ]);

    if (
      get().generation !== generation ||
      get().repositoryId !== repositoryId ||
      !history.isCurrent(revision)
    )
      return false;

    if (!statusResult.ok) {
      set({
        phase: statusResult.error.kind === "not-a-repository" ? "missing" : "error",
        error: statusResult.error,
      });
      return false;
    }

    const changes = statusResult.value.changes.slice(0, MAX_STATUS_CHANGES);
    const replaceHistory = historyResult.ok && history.firstPageChanged(historyResult.value);

    if (replaceHistory) {
      history.replaceFirst(historyResult.value);
    }

    set({
      phase: "ready",
      historyLoading: false,
      historyError: historyResult.ok ? null : historyResult.error,
      status: { ...statusResult.value, changes },
      truncatedChanges: changes.length < statusResult.value.changes.length,
      ...(historyResult.ok &&
        replaceHistory && {
          pages: [
            {
              ...historyResult.value,
              commits: historyResult.value.commits.slice(0, HISTORY_PAGE_SIZE),
            },
          ],
          baseOffset: 0,
          dagBoundary: history.firstBoundary(repositoryId),
          nextOffset: historyResult.value.nextOffset,
          historyError: null,
        }),
    });

    const selected = get().selection;

    if (selected && !get().writing) {
      diffRequest = null;
      diffRequestKey = null;
      await loadDiff({ ...selected });
    }
    return true;
  };

  const loadDiff = async (selection: Exclude<RepositorySelection, null>) => {
    const { repositoryId, generation } = get();

    if (!repositoryId) return;

    const key = `${generation}:${selection.kind}:${selection.kind === "commit" ? selection.oid : `${selection.area}:${selection.path}`}`;

    if (diffRequestKey === key && diffRequest) return diffRequest;

    const changed = JSON.stringify(get().selection) !== JSON.stringify(selection);

    set({
      selection,
      diff: null,
      diffLoading: true,
      error: null,
      ...(changed && {
        contentView: selection.kind === "change" ? "diff" : "history",
        commitFilePath: null,
        commitFileDiff: null,
        commitFileLoading: false,
        commitFileError: null,
      }),
    });

    if (changed) useLayoutStore.getState().reveal(selection.kind === "change" ? "diff" : "graph");
    if (get().identityId === useSessionStore.getState().snapshot?.context.profileId)
      useSessionStore.getState().setView(repositoryId, { selection });

    const request = (async () => {
      const result =
        selection.kind === "commit"
          ? await window.eda.repository.commitDiff({ repositoryId, oid: selection.oid })
          : await window.eda.repository.workingDiff({
              repositoryId,
              paths: [selection.path],
              area: selection.area === "staged" ? "staged" : "unstaged",
            });

      if (
        get().generation !== generation ||
        get().repositoryId !== repositoryId ||
        get().selection !== selection
      )
        return;

      if (result.ok) set({ diff: boundDiff(result.value), diffLoading: false });
      else set({ error: result.error, diffLoading: false });
    })();

    diffRequest = request;
    diffRequestKey = key;
    await request.finally(() => {
      if (diffRequest === request) {
        diffRequest = null;
        diffRequestKey = null;
      }
    });
  };

  const revealCommit = async (oid: string) => {
    if (get().pages.some((page) => page.commits.some((commit) => commit.oid === oid))) return;

    const { repositoryId, generation, selection, historyTip } = get();

    if (!repositoryId || selection?.kind !== "commit" || selection.oid !== oid) return;

    const revision = history.invalidate();

    set({ historyLoading: true });

    const result = await window.eda.repository.history({
      repositoryId,
      refs: [oid],
      offset: 0,
      limit: HISTORY_PAGE_SIZE,
    });

    if (get().generation !== generation || !history.isCurrent(revision)) return;

    if (get().selection !== selection) {
      set({ historyLoading: false });
      return;
    }

    if (!result.ok) {
      set({ historyTip, historyLoading: false, historyError: result.error });
      return;
    }

    history.replaceFirst(result.value);
    set({
      historyTip: oid,
      pages: [result.value],
      dagBoundary: { lanes: [] },
      baseOffset: 0,
      nextOffset: result.value.nextOffset,
      historyLoading: false,
      historyError: null,
    });
  };

  const runWrite = async (
    call: (repositoryId: string) => Promise<{ ok: boolean; error?: GitErrorData }>,
  ) => {
    const { repositoryId, identityId, generation } = get();

    if (!repositoryId || !identityId) return false;

    const before = get().selection;
    const successors =
      before?.kind === "change" ? successorPaths(get().status?.changes ?? [], before) : [];

    set({ writing: true, writeError: null });

    try {
      const result = await call(repositoryId);

      if (get().generation !== generation) return result.ok;

      if (!result.ok) {
        set({ writeError: result.error ?? null });
        return false;
      }

      const refreshed = await reloadAfterWrite(repositoryId);

      if (
        refreshed &&
        get().generation === generation &&
        before?.kind === "change" &&
        get().selection === before
      )
        await advanceSelection(before, successors);

      return true;
    } finally {
      if (get().generation === generation) set({ writing: false });
    }
  };

  const advanceSelection = async (
    previous: Extract<RepositorySelection, { kind: "change" }>,
    successors: string[],
  ): Promise<void> => {
    const remaining = categorizeChanges(get().status?.changes ?? [])[previous.area];

    if (remaining.some((change) => change.path === previous.path)) {
      diffRequest = null;
      return loadDiff({ ...previous });
    }

    const next = successors
      .map((path) => remaining.find((change) => change.path === path))
      .find((change) => change !== undefined);

    if (next) return loadDiff({ kind: "change", path: next.path, area: previous.area });
    set({ selection: null, diff: null, diffLoading: false, contentView: "history" });
    useLayoutStore.getState().reveal("graph");
  };

  const remember = (selection: Exclude<RepositorySelection, null>) => {
    const { navigation, navigationIndex } = get();
    const previous = navigation[navigationIndex];
    if (JSON.stringify(previous) === JSON.stringify(selection)) return;
    const next = [...navigation.slice(0, navigationIndex + 1), selection].slice(-100);
    set({ navigation: next, navigationIndex: next.length - 1 });
  };

  return {
    ...emptyState,
    generation: 0,
    open: load,
    async refresh() {
      const { repositoryId, identityId, phase } = get();
      if (repositoryId && identityId)
        await load(repositoryId, identityId, phase !== "missing", true);
    },
    async syncFromDisk() {
      const { repositoryId, phase } = get();
      if (repositoryId && phase === "ready") await reloadAfterWrite(repositoryId);
    },
    loadMore: history.loadMore,
    loadPrevious: history.loadPrevious,
    selectChange(change, area) {
      set({ contentView: "diff", commitFilePath: null });
      useLayoutStore.getState().reveal("diff");
      const selection = { kind: "change" as const, path: change.path, area };
      remember(selection);
      return loadDiff(selection);
    },
    selectCommit(oid) {
      set({ contentView: "history", commitFilePath: null });
      useLayoutStore.getState().reveal("graph");
      const selection = { kind: "commit" as const, oid };
      remember(selection);
      return loadDiff(selection);
    },
    async selectCommitFile(path) {
      const { repositoryId, generation, selection, diff, diffLoading } = get();

      if (!repositoryId || selection?.kind !== "commit" || diffLoading) return;

      const file = diff?.files.find((file) => (file.newPath ?? file.oldPath) === path);

      if (!file) return;

      const revision = ++commitFileRevision;

      set({
        contentView: "diff",
        commitFilePath: path,
        commitFileDiff: null,
        commitFileLoading: true,
        commitFileError: null,
      });
      useLayoutStore.getState().reveal("diff");

      const result = await window.eda.repository.commitDiff({
        repositoryId,
        oid: selection.oid,
        paths: [...new Set([path, ...(file.oldPath ? [file.oldPath] : [])])],
      });
      const current = get();

      if (
        revision !== commitFileRevision ||
        current.generation !== generation ||
        current.repositoryId !== repositoryId ||
        current.selection?.kind !== "commit" ||
        current.selection.oid !== selection.oid ||
        current.commitFilePath !== path
      )
        return;

      set(
        result.ok
          ? { commitFileDiff: boundDiff(result.value), commitFileLoading: false }
          : { commitFileError: result.error, commitFileLoading: false },
      );
    },
    showHistory() {
      set({ contentView: "history" });
      useLayoutStore.getState().reveal("graph");
    },
    showWorkingTree() {
      diffRequest = null;
      diffRequestKey = null;
      set({
        selection: null,
        diff: null,
        diffLoading: false,
        commitFilePath: null,
        commitFileDiff: null,
        commitFileLoading: false,
        commitFileError: null,
        contentView: "history",
      });

      const repositoryId = get().repositoryId;

      if (
        repositoryId &&
        get().identityId === useSessionStore.getState().snapshot?.context.profileId
      )
        useSessionStore.getState().setView(repositoryId, { selection: null });

      useLayoutStore.getState().reveal("graph");
    },
    async jumpToCommit(oid) {
      await get().selectCommit(oid);
      await revealCommit(oid);
    },
    async navigate(direction) {
      const index = get().navigationIndex + direction;
      const selection = get().navigation[index];

      if (!selection) return;

      set({
        navigationIndex: index,
        contentView: selection.kind === "commit" ? "history" : "diff",
        commitFilePath: null,
      });
      useLayoutStore.getState().reveal(selection.kind === "commit" ? "graph" : "diff");
      await loadDiff(selection);

      if (selection.kind === "commit") await revealCommit(selection.oid);
    },

    applyPartial(token) {
      return runWrite((repositoryId) => window.eda.repository.applyPartial(repositoryId, token));
    },
    async stage(paths) {
      await runWrite((repositoryId) =>
        window.eda.repository.stage({ repositoryId, ...(paths ? { paths } : {}) }),
      );
    },

    async unstage(paths) {
      await runWrite((repositoryId) =>
        window.eda.repository.unstage({ repositoryId, ...(paths ? { paths } : {}) }),
      );
    },

    async commit(message, options = {}) {
      const generation = get().generation;

      set({ commitNotice: null });

      return runWrite(async (repositoryId) => {
        const result = await window.eda.repository.commit({
          repositoryId,
          message,
          ...(options.amend ? { amend: true } : {}),
          ...(options.signOff ? { signOff: true } : {}),
          ...(options.stagePaths ? { stagePaths: options.stagePaths } : {}),
        });

        if (
          result.ok &&
          result.value.publishedCommits &&
          get().generation === generation &&
          get().repositoryId === repositoryId
        )
          set({
            commitNotice: t(
              "repositoryStore.amendmentCompletedAndReplacedPublishedHistoryNothingWas",
            ),
          });

        return result;
      });
    },
    clear() {
      const generation = get().generation + 1;
      openRequest = null;
      history.invalidate();
      diffRequest = null;
      set({ ...emptyState, generation });
    },
  };
});

export function successorPaths(
  changes: readonly RepositoryChange[],
  selection: Extract<RepositorySelection, { kind: "change" }>,
): string[] {
  const area = categorizeChanges(changes)[selection.area];
  const index = area.findIndex((change) => change.path === selection.path);
  if (index < 0) return [];
  return [...area.slice(index + 1), ...area.slice(0, index).reverse()].map((change) => change.path);
}

export function categorizeChanges(
  changes: readonly RepositoryChange[],
): Record<ChangeArea, RepositoryChange[]> {
  const categories: Record<ChangeArea, RepositoryChange[]> = {
    staged: [],
    unstaged: [],
    conflicted: [],
    untracked: [],
  };

  for (const change of changes) {
    if (change.kind === "ignored") continue;

    if (change.kind === "unmerged" || change.index === "U" || change.worktree === "U")
      categories.conflicted.push(change);
    else if (change.kind === "untracked" || change.worktree === "?")
      categories.untracked.push(change);
    else {
      if (change.index !== ".") categories.staged.push(change);
      if (change.worktree !== ".") categories.unstaged.push(change);
    }
  }

  return categories;
}
