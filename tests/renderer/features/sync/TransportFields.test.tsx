import { act } from "react";
import { createRoot } from "react-dom/client";
import { ok } from "@shared/errors";
import { TransferProgress } from "@renderer/features/sync/TransportFields";

it.each([true, false])(
  "keeps cancellation available with operation details shown: %s",
  async (showDetails) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const cancel = vi.fn().mockResolvedValue(ok(undefined));
    vi.stubGlobal("eda", {
      operations: {
        list: vi.fn().mockResolvedValue(
          ok([
            {
              id: "clone",
              kind: "Publier la branche",
              kindKey: "operationTitles.cloneRepository",
              repositoryId: "repo",
              cancellable: true,
              message: "Wrong activity",
            },
            {
              id: "push",
              kind: "Publier la branche",
              kindKey: "operationTitles.pushBranch",
              repositoryId: "repo",
              cancellable: true,
              message: "Sending objects",
              output: "Receiving objects: 50%",
            },
          ]),
        ),
        cancel,
      },
      events: { onOperationsChanged: () => () => {} },
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <TransferProgress
            repositoryId="repo"
            kindKey="operationTitles.pushBranch"
            showDetails={showDetails}
          />,
        ),
      );
      if (showDetails) {
        expect(container.textContent).toContain("Sending objects");
        expect(container.textContent).toContain("Receiving objects: 50%");
      } else {
        expect(container.textContent).not.toContain("Sending objects");
        expect(container.textContent).not.toContain("Receiving objects: 50%");
      }
      expect(container.textContent).not.toContain("Wrong activity");
      await act(async () => container.querySelector("button")!.click());
      expect(cancel).toHaveBeenCalledWith("push");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);
