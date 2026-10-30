import { useLayoutStore, type PanelId } from "../../../stores/layout-store";
import type { PanelState } from "../PanelControls";
import { useLayoutTransition } from "./useLayoutTransition";

export function usePanel(panel: PanelId): {
  state: PanelState;
  toggleMaximize: () => void;
  toggleCollapse: () => void;
} {
  const transition = useLayoutTransition();
  const maximized = useLayoutStore((s) => s.maximized);
  const collapsed = useLayoutStore((s) => s.collapsed[panel]);
  const toggleMaximize = useLayoutStore((s) => s.toggleMaximize);
  const toggleCollapse = useLayoutStore((s) => s.toggleCollapse);

  const state = maximized
    ? maximized === panel
      ? "maximized"
      : "collapsed"
    : collapsed
      ? "collapsed"
      : "normal";

  return {
    state,
    toggleMaximize: () => transition(() => toggleMaximize(panel)),
    toggleCollapse: () =>
      transition(() =>
        maximized && maximized !== panel ? toggleMaximize(maximized) : toggleCollapse(panel),
      ),
  };
}
