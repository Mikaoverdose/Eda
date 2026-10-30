import { act } from "react";
import { createRoot } from "react-dom/client";
import { useUpdates } from "@renderer/features/updates/hooks/useUpdates";
import type { UpdateState } from "@shared/updates";

it("does not let a delayed status query overwrite a newer download event", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let deliver!: (state: UpdateState) => void;
  let finish!: (value: { ok: true; value: UpdateState }) => void;
  const unsubscribe = vi.fn();
  vi.stubGlobal("eda", {
    events: {
      onUpdateChanged: (listener: typeof deliver) => {
        deliver = listener;
        return unsubscribe;
      },
    },
    updates: {
      state: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
  });
  const state: UpdateState = {
    revision: 2,
    capability: "automatic",
    reason: null,
    phase: "ready",
    feedUrl: null,
    checkedAt: null,
    release: null,
    progress: null,
    error: null,
  };
  function Probe() {
    const { state } = useUpdates();
    return <p>{state?.phase}</p>;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Probe />));
    await act(async () => deliver(state));
    await act(async () => finish({ ok: true, value: { ...state, revision: 0, phase: "idle" } }));
    expect(container.textContent).toBe("ready");
    await act(async () => deliver({ ...state, revision: 3, phase: "installing" }));
    expect(container.textContent).toBe("installing");
  } finally {
    await act(async () => root.unmount());
    expect(unsubscribe).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  }
});
