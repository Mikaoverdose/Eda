import { act } from "react";
import { createRoot } from "react-dom/client";
import { RendererFailureBoundary } from "@renderer/app/RendererFailure";
import { FailureSimulations } from "@renderer/features/settings/debug/FailureSimulations";

it("requires confirmation for render failure and reaches the real recovery boundary", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const container = document.createElement("div");

  document.body.append(container);

  const root = createRoot(container);
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

  async function click(label: string) {
    const button = Array.from(document.querySelectorAll("button")).find(
      (item) => item.textContent === label,
    );
    expect(button).toBeTruthy();
    await act(async () => button!.click());
  }

  try {
    await act(async () =>
      root.render(
        <RendererFailureBoundary>
          <FailureSimulations />
        </RendererFailureBoundary>,
      ),
    );
    await click("Trigger render error...");
    await click("Cancel");
    expect(container.textContent).toContain("Uncaught runtime error");

    await click("Trigger render error...");
    await click("Trigger render error");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Eda debug simulation: React render error.",
    );
    expect(container.textContent).toContain("Reload Eda");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    log.mockRestore();
    vi.unstubAllGlobals();
  }
});
