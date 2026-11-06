import { act } from "react";
import { createRoot } from "react-dom/client";
import { StatusBanner } from "@renderer/components/ui/feedback/StatusBanner";

it("supports dismissible warnings and persistent errors with the appropriate announcement", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const dismiss = vi.fn();
  const container = document.createElement("div");
  const root = createRoot(container);

  try {
    await act(async () =>
      root.render(
        <>
          <StatusBanner label="Connection warning" tone="warning" onDismiss={dismiss}>
            Connection interrupted
          </StatusBanner>

          <StatusBanner label="Save error" tone="error">
            Changes could not be saved
          </StatusBanner>
        </>,
      ),
    );

    expect(container.querySelector('[role="status"]')?.textContent).toBe("Connection interrupted");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Changes could not be saved",
    );
    expect(container.querySelector('[aria-label="Save error"] button')).toBeNull();

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Dismiss Connection warning"]')!
        .click(),
    );

    expect(dismiss).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());

    vi.unstubAllGlobals();
  }
});
