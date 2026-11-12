import { errorFixture } from "../../../helpers/error";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ok, err } from "@shared/errors";
import type { RepositoryTrustRequest } from "@shared/repository/repository";
import { RepositoryTrustDialog } from "@renderer/features/repositories/RepositoryTrustDialog";

const request: RepositoryTrustRequest = {
  id: "request",
  path: "/repositories/example",
  reasons: ["filter.fixture"],
};
let root: Root;
let container: HTMLDivElement;
let changed: (request: RepositoryTrustRequest | null) => void;
let pending: ReturnType<typeof vi.fn>;
let respond: ReturnType<typeof vi.fn>;
let unsubscribe: ReturnType<typeof vi.fn>;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const button = (label: string) =>
  Array.from(dialog()!.querySelectorAll("button")).find((item) => item.textContent === label)!;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  pending = vi.fn(async () => ok(null));
  respond = vi.fn(async () => ok(undefined));
  unsubscribe = vi.fn();
  vi.stubGlobal("eda", {
    repository: { pendingTrust: pending, respondTrust: respond },
    events: {
      onRepositoryTrustChanged: (handler: typeof changed) => {
        changed = handler;
        return unsubscribe;
      },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const open = async () => {
  await act(async () => root.render(<RepositoryTrustDialog />));
  await act(async () => changed(request));
};

it("uses the shared app modal, displays the repository and detected features, and defaults focus to Keep disabled", async () => {
  await open();
  expect(dialog()?.getAttribute("aria-modal")).toBe("true");
  expect(dialog()?.textContent).toContain("filter.fixture");
  expect(dialog()?.textContent).toContain(request.path);
  expect(dialog()?.textContent).toContain("Keep them disabled unless you trust");
  expect(document.activeElement).toBe(button("Keep disabled"));
  const details = dialog()!.querySelector("details")!;
  expect(details.open).toBe(false);
  expect(details.querySelector("summary")?.textContent).toContain("Detected features (1)");
  await act(async () => details.querySelector("summary")!.click());
  expect(details.open).toBe(true);
  expect(details.textContent).toContain("filter.fixture");
  expect(dialog()?.className).toContain("bg-bg-overlay");
  await act(async () => button("Trust and enable").click());
  expect(respond).toHaveBeenCalledWith(request.id, true);
  expect(dialog()).toBeNull();
});

it.each(["Keep disabled", "Escape", "Close dialog"])(
  "declines trust when dismissed via %s",
  async (action) => {
    await open();
    await act(async () => {
      if (action === "Escape")
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      else if (action === "Close dialog")
        dialog()!.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click();
      else button(action).click();
    });
    expect(respond).toHaveBeenCalledWith(request.id, false);
    expect(dialog()).toBeNull();
  },
);

it("closes an expired prompt without sending a trust decision", async () => {
  await open();
  await act(async () => changed(null));
  expect(dialog()).toBeNull();
  expect(respond).not.toHaveBeenCalled();
});

it("does not reopen an expired prompt from an older initial read", async () => {
  let finish!: (value: ReturnType<typeof ok<RepositoryTrustRequest>>) => void;
  pending.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => root.render(<RepositoryTrustDialog />));
  await act(async () => {
    changed(request);
    changed(null);
  });
  await act(async () => finish(ok(request)));
  expect(dialog()).toBeNull();
});

it("recovers a pending prompt if it was emitted before the listener mounted", async () => {
  pending.mockResolvedValueOnce(ok(request));
  await act(async () => root.render(<RepositoryTrustDialog />));
  expect(dialog()?.textContent).toContain(request.path);
});

it("retains the prompt and allows retry if the response fails", async () => {
  respond.mockResolvedValueOnce(
    err(
      errorFixture({ kind: "unknown", operation: "fixture", message: "Could not send decision" }),
    ),
  );
  await open();
  await act(async () => button("Trust and enable").click());
  expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe("Could not send decision");
  await act(async () => button("Keep disabled").click());
  expect(respond).toHaveBeenLastCalledWith(request.id, false);
  expect(dialog()).toBeNull();
});

it("shows the local repository warning when opening an existing folder", async () => {
  pending.mockResolvedValueOnce(ok({ id: "local", path: request.path }));
  await act(async () => root.render(<RepositoryTrustDialog />));
  expect(dialog()?.textContent).toContain(request.path);
  expect(dialog()?.textContent).toContain("Keep them disabled unless you trust");
  expect(dialog()?.textContent).not.toContain("After cloning");
});
