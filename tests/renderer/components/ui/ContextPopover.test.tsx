import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ContextPopover } from "@renderer/components/ui/overlays/ContextPopover";
import { ModalSurfaceContext } from "@renderer/components/ui/overlays/ModalSurface";

let root: Root;
let host: HTMLDivElement;
let resize: () => void;
let width = 180;
let height = 140;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerWidth", 400);
  vi.stubGlobal("innerHeight", 300);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => height);

  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );

  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("fits the measured menu inside the viewport and repositions when its content grows", async () => {
  await act(async () =>
    root.render(
      <ContextPopover position={{ x: 390, y: 290 }} role="menu" onClose={() => {}}>
        Menu
      </ContextPopover>,
    ),
  );

  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  expect(menu.style.left).toBe("212px");
  expect(menu.style.top).toBe("152px");

  width = 280;
  height = 260;
  resize();
  expect(menu.style.left).toBe("112px");
  expect(menu.style.top).toBe("32px");
});

it("keeps nested menus inside the modal and accounts for its scroll and position", async () => {
  const modal = document.createElement("div");
  document.body.append(modal);
  vi.spyOn(modal, "getBoundingClientRect").mockReturnValue({ left: 20, top: 30 } as DOMRect);
  modal.scrollLeft = 5;
  modal.scrollTop = 10;
  width = 180;
  height = 140;

  await act(async () =>
    root.render(
      <ModalSurfaceContext value={{ current: modal }}>
        <ContextPopover position={{ x: 390, y: 290 }} role="menu" onClose={() => {}}>
          Menu
        </ContextPopover>
      </ModalSurfaceContext>,
    ),
  );

  const menu = modal.querySelector<HTMLElement>('[role="menu"]')!;
  expect(menu.style.position).toBe("absolute");
  expect(menu.style.left).toBe("197px");
  expect(menu.style.top).toBe("132px");
  modal.remove();
});
