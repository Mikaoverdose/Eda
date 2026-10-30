import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
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
