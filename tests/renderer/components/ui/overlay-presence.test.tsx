import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal } from "react-dom";
import { hasOpenOverlay } from "@renderer/components/ui/overlays/overlay-presence";
import { ModalBehaviorContext } from "@renderer/components/ui/overlays/ModalSurface";
import { Dialog } from "@renderer/components/ui/overlays/Dialog";
import { PopoverSurface } from "@renderer/components/ui/overlays/PopoverSurface";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  expect(hasOpenOverlay()).toBe(false);
});

it("tracks nested surfaces independently across StrictMode cleanup and rerenders", async () => {
  function Example({ dialog, popover }: { dialog: boolean; popover: boolean }) {
    return (
      <StrictMode>
        <ModalBehaviorContext value={false}>
          {dialog && (
            <Dialog title="Review" onClose={() => {}}>
              Changes
            </Dialog>
          )}
          {popover && (
            <PopoverSurface role="dialog" onClose={() => {}}>
              Options
            </PopoverSurface>
          )}
        </ModalBehaviorContext>
      </StrictMode>
    );
  }
  expect(hasOpenOverlay()).toBe(false);
  await act(async () => root.render(<Example dialog popover />));
  expect(hasOpenOverlay()).toBe(true);
  await act(async () => root.render(<Example dialog={false} popover />));
  expect(hasOpenOverlay()).toBe(true);
  await act(async () => root.render(<Example dialog={false} popover={false} />));
  expect(hasOpenOverlay()).toBe(false);
});

it("Escape dismisses a portaled menu without closing its parent dialog", async () => {
  const closeDialog = vi.fn();
  const closeMenu = vi.fn();
  await act(async () => {
    root.render(
      <ModalBehaviorContext value={false}>
        <Dialog title="References" onClose={closeDialog}>
          {createPortal(
            <PopoverSurface role="menu" onClose={closeMenu}>
              <button role="menuitem">Copy name</button>
            </PopoverSurface>,
            document.body,
          )}
        </Dialog>
      </ModalBehaviorContext>,
    );
  });

  const item = document.querySelector<HTMLElement>('[role="menuitem"]')!;
  item.focus();
  await act(async () => {
    item.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  expect(closeMenu).toHaveBeenCalledOnce();
  expect(closeDialog).not.toHaveBeenCalled();
});
