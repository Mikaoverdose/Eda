import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AnimatedSize } from "@renderer/components/ui/display/AnimatedSize";

let root: Root;
let container: HTMLDivElement;
let resize: (entries?: ResizeObserverEntry[]) => void;
let height: number;
const disconnect = vi.fn();

beforeEach(() => {
  height = 80;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: (entries?: ResizeObserverEntry[]) => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );

  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => height);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  disconnect.mockClear();
});

it("measures immediately, animates later changes and preserves focused inputs", async () => {
  await act(async () =>
    root.render(
      <AnimatedSize>
        <input defaultValue="kept" />
      </AnimatedSize>,
    ),
  );

  const surface = container.firstElementChild as HTMLElement;
  const input = container.querySelector("input")!;
  input.focus();

  expect(surface.style.blockSize).toBe("80px");
  expect(surface.dataset["sizeMotion"]).toBe("follow");

  height = 180;
  resize();
  expect(surface.style.blockSize).toBe("180px");
  expect(surface.dataset["sizeMotion"]).toBe("animate");

  height = 0;
  resize();
  expect(surface.style.blockSize).toBe("0px");
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("kept");

  await act(async () => root.unmount());
  expect(disconnect).toHaveBeenCalledOnce();
});

it("follows a nested size animation without starting a second resize", async () => {
  await act(async () => root.render(<AnimatedSize>Content</AnimatedSize>));
  const surface = container.firstElementChild as HTMLElement;
  const inner = surface.firstElementChild!;
  vi.stubGlobal("KeyframeEffect", class {});

  const effect = Object.assign(new KeyframeEffect(null, []), {
    getKeyframes: () => [{ blockSize: "180px" }],
  });

  Object.assign(inner, {
    getAnimations: () => [{ playState: "running", effect }],
  });

  height = 180;
  resize();
  expect(surface.style.blockSize).toBe("180px");
  expect(surface.dataset["sizeMotion"]).toBe("follow");

  Object.assign(inner, { getAnimations: () => [] });
  height = 100;
  resize();
  expect(surface.dataset["sizeMotion"]).toBe("animate");
});

it("uses natural layout when reduced motion is enabled", async () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  await act(async () => root.render(<AnimatedSize>Content</AnimatedSize>));
  const surface = container.firstElementChild as HTMLElement;

  height = 180;
  resize();
  expect(surface.style.blockSize).toBe("auto");
  expect(surface.dataset["sizeMotion"]).toBe("follow");
});

it("measures layout dimensions independently of ancestor scaling", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    height: 720,
  } as DOMRect);

  await act(async () => root.render(<AnimatedSize>Content</AnimatedSize>));
  const surface = container.firstElementChild as HTMLElement;
  expect(surface.style.blockSize).toBe("80px");
  const size = [{ blockSize: 120.5, inlineSize: 200 }];

  resize([
    {
      target: surface.firstElementChild!,
      borderBoxSize: size,
      contentBoxSize: size,
      devicePixelContentBoxSize: size,
      contentRect: new DOMRect(0, 0, 200, 120.5),
    },
  ]);

  expect(surface.style.blockSize).toBe("120.5px");
});
