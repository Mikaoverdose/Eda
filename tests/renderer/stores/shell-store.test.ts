import { openSettings } from "@renderer/commands/open-settings";
import { useShellStore } from "@renderer/stores/shell-store";

afterEach(() => useShellStore.setState({ request: null }));

it("keeps a newer navigation request when an older one is acknowledged", () => {
  openSettings("integrations");
  const first = useShellStore.getState().request!;
  expect(first).toEqual({ kind: "settings", section: "integrations" });
  useShellStore.getState().startTour();
  useShellStore.getState().consume(first);
  expect(useShellStore.getState().request).toEqual({ kind: "tour" });
  useShellStore.getState().consume(useShellStore.getState().request!);
  expect(useShellStore.getState().request).toBeNull();
});
