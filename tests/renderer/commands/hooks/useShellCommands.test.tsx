import { act } from "react";
import { createRoot } from "react-dom/client";
import { useShellCommands } from "@renderer/commands/hooks/useShellCommands";
import { PopoverSurface } from "@renderer/components/ui/overlays/PopoverSurface";
import { useAppStore } from "@renderer/stores/app-store";
import { useSessionStore } from "@renderer/stores/session-store";

it("blocks shell shortcuts until the last overlay closes, then resumes them", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("eda", { app: { platform: "linux" } });
  const previousApp = useAppStore.getState();
  const previousSession = useSessionStore.getState();
  const openCommands = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  function Example({ overlays }: { overlays: number }) {
    useShellCommands({
      workspace: true,
      openCommands,
      openShortcuts: vi.fn(),
      browse: vi.fn(),
      profiles: vi.fn(),
      createProfile: vi.fn(),
      toggleSettings: vi.fn(),
      showWorkspace: vi.fn(),
    });
    return (
      <>
        {Array.from({ length: overlays }, (_, index) => (
          <PopoverSurface key={index} role="dialog" onClose={() => {}}>
            Options
          </PopoverSurface>
        ))}
      </>
    );
  }
  const shortcut = async () => {
    const event = new KeyboardEvent("keydown", {
      key: "p",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
  };
  try {
    useAppStore.setState({
      loading: false,
      switchingIdentityId: null,
      activeIdentity: { id: "profile" } as NonNullable<typeof previousApp.activeIdentity>,
    });
    useSessionStore.setState({ transitioning: false });
    await act(async () => root.render(<Example overlays={2} />));
    await shortcut();
    expect(openCommands).not.toHaveBeenCalled();
    await act(async () => root.render(<Example overlays={1} />));
    await shortcut();
    expect(openCommands).not.toHaveBeenCalled();
    await act(async () => root.render(<Example overlays={0} />));
    await shortcut();
    expect(openCommands).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    useAppStore.setState(previousApp);
    useSessionStore.setState(previousSession);
    vi.unstubAllGlobals();
  }
});
