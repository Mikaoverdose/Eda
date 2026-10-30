import { create } from "zustand";
import {
  emptyView,
  type CommitDraft,
  type RepositoryView,
  type SessionChange,
  type SessionSnapshot,
} from "@shared/identity/profile-session";

function sharedLayout(
  view: RepositoryView,
): Pick<RepositoryView, "maximized" | "collapsed" | "splits" | "references"> {
  return {
    maximized: view.maximized,
    collapsed: view.collapsed,
    splits: view.splits,
    references: view.references ?? { hidden: false, locals: true, remotes: true, tags: true },
  };
}

interface SessionState {
  snapshot: SessionSnapshot | null;
  error: string | null;
  saving: boolean;
  transitioning: boolean;
  draftRevisions: Record<string, number>;
  load: () => Promise<boolean>;
  change: (change: SessionChange) => void;
  setView: (repositoryId: string, patch: Partial<RepositoryView>) => void;
  setDraft: (repositoryId: string, draft: CommitDraft) => void;
  flush: () => Promise<boolean>;
  reset: () => Promise<boolean>;
}

const pending: { context: SessionSnapshot["context"]; change: SessionChange }[] = [];
let worker: Promise<boolean> | null = null;
let loadGeneration = 0;

export const useSessionStore = create<SessionState>((set, get) => ({
  snapshot: null,
  error: null,
  saving: false,
  transitioning: false,
  draftRevisions: {},
  async load() {
    const generation = ++loadGeneration;
    const context = get().snapshot?.context;
    const current = () =>
      generation === loadGeneration &&
      get().snapshot?.context.profileId === context?.profileId &&
      get().snapshot?.context.windowId === context?.windowId &&
      get().snapshot?.context.generation === context?.generation;

    if (!(await get().flush()) || !current()) return false;

    try {
      const result = await window.eda.sessions.open();

      if (!current()) return false;
      if (!result.ok) {
        set({ error: result.error.message });
        return false;
      }

      set({ snapshot: result.value, error: null });

      return true;
    } catch (error) {
      if (current()) set({ error: String(error) });
      return false;
    }
  },
  change(change) {
    const snapshot = get().snapshot;

    if (!snapshot || snapshot.recovery || get().transitioning) return;

    const next = structuredClone(snapshot);

    if (change.kind === "tabs") {
      const previousId = next.session.selectedRepositoryId;
      const previous =
        (previousId ? next.session.views[previousId] : undefined) ??
        Object.values(next.session.views)[0];

      if (previous && change.selectedRepositoryId) {
        const id = change.selectedRepositoryId;

        next.session.views[id] = {
          ...(next.session.views[id] ?? emptyView()),
          ...sharedLayout(previous),
        };
        pending.push({
          context: snapshot.context,
          change: { kind: "view", repositoryId: id, view: next.session.views[id]! },
        });
      }

      next.session.tabs = change.tabs;
      next.session.selectedRepositoryId = change.selectedRepositoryId;
    } else if (change.kind === "view") next.session.views[change.repositoryId] = change.view;
    else next.drafts[change.repositoryId] = change.draft;

    set({ snapshot: next });
    pending.push({ context: snapshot.context, change });
    void get().flush();
  },
  setView(repositoryId, patch) {
    const previous = get().snapshot?.session.views[repositoryId] ?? emptyView();
    const view = { ...previous, ...patch };
    const presentationChanged = ["maximized", "collapsed", "splits", "references"].some((key) =>
      Object.hasOwn(patch, key),
    );

    if (presentationChanged) {
      const views = get().snapshot?.session.views ?? {};

      for (const [id, existing] of Object.entries(views)) {
        if (id !== repositoryId)
          get().change({
            kind: "view",
            repositoryId: id,
            view: { ...existing, ...sharedLayout(view) },
          });
      }
    }

    get().change({ kind: "view", repositoryId, view });
  },
  setDraft(repositoryId, draft) {
    const key = `${get().snapshot?.context.profileId}:${repositoryId}`;
    set({
      draftRevisions: { ...get().draftRevisions, [key]: (get().draftRevisions[key] ?? 0) + 1 },
    });
    get().change({ kind: "draft", repositoryId, draft });
  },
  async flush() {
    if (worker) return worker;
    if (!pending.length) return true;

    set({ saving: true, error: null });
    worker = (async () => {
      try {
        while (pending.length) {
          const item = pending[0]!;
          const result = await window.eda.sessions.change(item.context, item.change);

          if (!result.ok) {
            set({ error: result.error.message });
            return false;
          }

          pending.shift();
        }

        return true;
      } catch (error) {
        set({ error: String(error) });
        return false;
      } finally {
        set({ saving: false });
      }
    })();

    const result = await worker;

    worker = null;

    return result;
  },
  async reset() {
    const context = get().snapshot?.context;

    if (!context || pending.length) return false;

    const result = await window.eda.sessions.reset(context);

    if (!result.ok) {
      set({ error: result.error.message });
      return false;
    }

    set({ snapshot: result.value, error: null });

    return true;
  },
}));
