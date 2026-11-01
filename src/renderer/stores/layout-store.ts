import { create } from "zustand";
import { emptyView, type PanelId, type RepositoryView } from "@shared/identity/profile-session";
import { useSessionStore } from "./session-store";

export type { PanelId } from "@shared/identity/profile-session";

interface LayoutState {
  maximized: PanelId | null;
  collapsed: Record<PanelId, boolean>;

  toggleMaximize: (panel: PanelId) => void;
  toggleCollapse: (panel: PanelId) => void;
  reveal: (panel: "graph" | "diff") => void;
  isVisible: (panel: PanelId) => boolean;
  restore: (view?: RepositoryView) => void;
  preset: (preset: "default" | "compact") => void;
}

function persist(state: Pick<LayoutState, "maximized" | "collapsed">): void {
  const session = useSessionStore.getState();
  const repositoryId = session.snapshot?.session.selectedRepositoryId;
  if (repositoryId) session.setView(repositoryId, state);
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  maximized: null,
  collapsed: emptyView().collapsed,
  preset(preset) {
    const session = useSessionStore.getState();
    const repositoryId = session.snapshot?.session.selectedRepositoryId;

    if (!repositoryId) return;

    const view = {
      maximized: null,
      collapsed: emptyView().collapsed,
      splits:
        preset === "compact" ? { "eda.layout.rail": 0.7, "eda.layout.history-height": 0.35 } : {},
      references: { hidden: preset === "compact", locals: true, remotes: true, tags: true },
    };

    set({ maximized: view.maximized, collapsed: view.collapsed });
    session.setView(repositoryId, view);
  },
  restore(view) {
    const restored = view ?? emptyView();
    set({ maximized: restored.maximized, collapsed: restored.collapsed });
  },

  reveal(panel) {
    const collapsed = { ...get().collapsed, [panel]: false };
    const current = get().maximized;
    const maximized = current === "rail" ? null : current ? panel : null;
    if (!get().collapsed[panel] && maximized === current) return;
    set({ collapsed, maximized });
    persist({ collapsed, maximized });
  },

  toggleMaximize(panel) {
    const maximized = get().maximized === panel ? null : panel;
    const collapsed = maximized ? { ...get().collapsed, [panel]: false } : get().collapsed;
    set({ maximized, collapsed });
    persist({ maximized, collapsed });
  },

  toggleCollapse(panel) {
    const collapsed = { ...get().collapsed, [panel]: !get().collapsed[panel] };
    if (Object.values(collapsed).every(Boolean)) return;
    const maximized = collapsed[panel] && get().maximized === panel ? null : get().maximized;
    set({ collapsed, maximized });
    persist({ maximized, collapsed });
  },

  isVisible(panel) {
    const { maximized, collapsed } = get();
    if (maximized) return maximized === panel;
    return !collapsed[panel];
  },
}));
