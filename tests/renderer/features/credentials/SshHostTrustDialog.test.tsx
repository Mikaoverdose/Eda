import { errorFixture } from "../../../helpers/error";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ok, err } from "@shared/errors";
import type { SshHostTrustRequest } from "@shared/identity/ssh";
import { SshHostTrustDialog } from "@renderer/features/credentials/SshHostTrustDialog";

const request: SshHostTrustRequest = {
  id: "request",
  host: "example.com (192.0.2.1)",
  algorithm: "ED25519",
  fingerprint: `SHA256:${"a".repeat(43)}`,
};
let root: Root;
let container: HTMLDivElement;
let changed: (request: SshHostTrustRequest | null) => void;
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
    ssh: { pendingHostTrust: pending, respondHostTrust: respond },
    events: {
      onSshHostTrustChanged: (handler: typeof changed) => {
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
  await act(async () => root.render(<SshHostTrustDialog />));
  await act(async () => changed(request));
};

it("uses the shared app modal, displays the exact fingerprint, and defaults focus to Cancel", async () => {
  await open();
  expect(dialog()?.getAttribute("aria-modal")).toBe("true");
  expect(dialog()?.textContent).toContain(request.host);
  expect(dialog()?.querySelector("code")?.textContent).toBe(request.fingerprint);
  expect(dialog()?.className).toContain("bg-bg-overlay");
  expect(document.activeElement).toBe(button("Cancel"));
  await act(async () => button("Trust and continue").click());
  expect(respond).toHaveBeenCalledWith(request.id, true);
  expect(dialog()).toBeNull();
});

it.each(["Cancel", "Escape", "Close dialog"])(
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
  let finish!: (value: ReturnType<typeof ok<SshHostTrustRequest>>) => void;
  pending.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => root.render(<SshHostTrustDialog />));
  await act(async () => {
    changed(request);
    changed(null);
  });
  await act(async () => finish(ok(request)));
  expect(dialog()).toBeNull();
});

it("recovers a pending prompt if it was emitted before the listener mounted", async () => {
  pending.mockResolvedValueOnce(ok(request));
  await act(async () => root.render(<SshHostTrustDialog />));
  expect(dialog()?.textContent).toContain(request.fingerprint);
});

it("retains the prompt and allows retry if the response fails", async () => {
  respond.mockResolvedValueOnce(
    err(
      errorFixture({ kind: "unknown", operation: "fixture", message: "Could not send decision" }),
    ),
  );
  await open();
  await act(async () => button("Trust and continue").click());
  expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe("Could not send decision");
  await act(async () => button("Cancel").click());
  expect(respond).toHaveBeenLastCalledWith(request.id, false);
  expect(dialog()).toBeNull();
});
