import { useLayoutStore } from "@renderer/stores/layout-store";
import { useSessionStore } from "@renderer/stores/session-store";
import { emptyView } from "@shared/identity/profile-session";

const reset = () =>
  useLayoutStore.setState({
    maximized: null,
    collapsed: { graph: false, diff: false, rail: false },
  });

describe("panel layout state", () => {
  it("updates layout preferences without replacing the saved selection", () => {
    const setView = vi.spyOn(useSessionStore.getState(), "setView").mockImplementation(() => {});

    useSessionStore.setState({
      snapshot: {
        context: { profileId: "p", windowId: "main", generation: 1 },
        session: {
          version: 1,
          tabs: ["r"],
          selectedRepositoryId: "r",
          views: { r: { ...emptyView(), selection: { kind: "commit", oid: "abcd" } } },
        },
        drafts: {},
        recovery: null,
      },
    });
    useLayoutStore.getState().preset("compact");
    expect(setView).toHaveBeenLastCalledWith(
      "r",
      expect.objectContaining({ references: expect.objectContaining({ hidden: true }) }),
    );

    useLayoutStore.getState().preset("default");
    expect(setView).toHaveBeenLastCalledWith(
      "r",
      expect.objectContaining({
        splits: {},
        maximized: null,
        references: expect.objectContaining({ hidden: false }),
      }),
    );
    expect(setView.mock.calls.every(([, value]) => !("selection" in value))).toBe(true);

    setView.mockRestore();
    useSessionStore.setState({ snapshot: null });
  });

  beforeEach(reset);

  it("shows every panel by default", () => {
    const { isVisible } = useLayoutStore.getState();
    expect([isVisible("graph"), isVisible("diff"), isVisible("rail")]).toEqual([true, true, true]);
  });

  it("hides the other panels while one is maximized", () => {
    useLayoutStore.getState().toggleMaximize("diff");

    const { isVisible } = useLayoutStore.getState();

    expect([isVisible("graph"), isVisible("diff"), isVisible("rail")]).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("restores every panel when the maximized one is toggled off", () => {
    useLayoutStore.getState().toggleMaximize("diff");
    useLayoutStore.getState().toggleMaximize("diff");
    expect(useLayoutStore.getState().maximized).toBeNull();
    expect(useLayoutStore.getState().isVisible("graph")).toBe(true);
  });

  it("moves the maximized panel rather than stacking two", () => {
    useLayoutStore.getState().toggleMaximize("diff");
    useLayoutStore.getState().toggleMaximize("graph");
    expect(useLayoutStore.getState().maximized).toBe("graph");
    expect(useLayoutStore.getState().isVisible("diff")).toBe(false);
  });

  it("collapses a panel without touching the others", () => {
    useLayoutStore.getState().toggleCollapse("rail");
    const { isVisible } = useLayoutStore.getState();
    expect([isVisible("graph"), isVisible("diff"), isVisible("rail")]).toEqual([true, true, false]);
  });

  it("clears a stale collapse when the same panel is maximized", () => {
    useLayoutStore.getState().toggleCollapse("graph");
    useLayoutStore.getState().toggleMaximize("graph");
    expect(useLayoutStore.getState().collapsed.graph).toBe(false);
    expect(useLayoutStore.getState().isVisible("graph")).toBe(true);
  });

  it("refuses to collapse the last visible panel", () => {
    const { toggleCollapse } = useLayoutStore.getState();

    toggleCollapse("graph");
    toggleCollapse("diff");
    toggleCollapse("rail");

    expect(useLayoutStore.getState().collapsed.rail).toBe(false);
    expect(useLayoutStore.getState().isVisible("rail")).toBe(true);
  });

  it("drops maximization when the maximized panel is collapsed", () => {
    useLayoutStore.getState().toggleMaximize("diff");
    useLayoutStore.getState().toggleCollapse("diff");
    expect(useLayoutStore.getState().maximized).toBeNull();
    expect(useLayoutStore.getState().isVisible("diff")).toBe(false);
    expect(useLayoutStore.getState().isVisible("graph")).toBe(true);
  });
});
