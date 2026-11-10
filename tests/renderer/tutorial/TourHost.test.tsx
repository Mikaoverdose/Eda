import { act } from "react";
import { createRoot } from "react-dom/client";
import { TourHost } from "@renderer/tutorial/TourHost";
import { demoIdentity } from "@renderer/tutorial/demo";
import { useAppStore } from "@renderer/stores/app-store";

it("sends appearance without copying the active account or fetching its avatar", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const getAvatar = vi.fn();
  vi.stubGlobal("eda", { app: { platform: "linux" }, avatars: { get: getAvatar } });
  const previous = useAppStore.getState();
  useAppStore.setState({
    activeIdentity: {
      ...demoIdentity,
      name: "Outside Fixture",
      gitEmail: "outside@example.test",
      avatarPath: "/outside/avatar.png",
    },
  });
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<TourHost onClose={() => {}} />));
    const frame = container.querySelector("iframe")!;
    // happy-dom does not load the iframe document; supply its message boundary.
    const send = vi.fn();
    const child = { postMessage: send };
    Object.defineProperty(frame, "contentWindow", { value: child, configurable: true });
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: child as unknown as Window,
          data: { type: "eda:tour-ready" },
        }),
      );
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "eda:tour-appearance", platform: "linux" }),
      "*",
    );
    const payload = send.mock.calls[0]![0];
    expect(payload).not.toHaveProperty("profile");
    expect(payload).not.toHaveProperty("avatar");
    expect(JSON.stringify(payload)).not.toContain("outside@example.test");
    expect(getAvatar).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    useAppStore.setState(previous);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
