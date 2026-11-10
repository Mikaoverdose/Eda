import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HuePicker } from "@renderer/components/ui/forms/HuePicker";

let container: HTMLDivElement;
let root: Root;

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
});

it("commits native color changes and returns focus to the custom color control", async () => {
  const onChange = vi.fn();
  await act(async () => root.render(<HuePicker value={210} onChange={onChange} />));
  const custom = container.querySelector<HTMLInputElement>('input[value="custom"]')!;

  await act(async () => {
    custom.focus();
    custom.click();
  });

  const native = document.querySelector<HTMLInputElement>('input[type="color"]')!;
  expect(native).not.toBeNull();

  await act(async () => {
    native.value = "#112233";
    native.dispatchEvent(new Event("change", { bubbles: true }));
  });

  expect(onChange).toHaveBeenCalledWith("#112233");
  const hex = document.querySelector<HTMLInputElement>('input[autocomplete="off"]')!;

  await act(async () =>
    hex.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );

  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(custom);
});

it("keeps the custom picker within a modal and closes only the picker on Escape", async () => {
  const { Dialog } = await import("@renderer/components/ui/overlays/Dialog");
  const closeDialog = vi.fn();

  await act(async () =>
    root.render(
      <Dialog title="Profile appearance" onClose={closeDialog}>
        <HuePicker value={210} onChange={vi.fn()} />
        <button>Other control</button>
      </Dialog>,
    ),
  );

  const modal = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const custom = modal.querySelector<HTMLInputElement>('input[value="custom"]')!;
  await act(async () => custom.click());
  const picker = modal.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(picker).not.toBeNull();
  const input = picker.querySelector<HTMLInputElement>('input[autocomplete="off"]')!;

  await act(async () =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );

  expect(modal.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(custom);
  expect(closeDialog).not.toHaveBeenCalled();

  await act(async () => custom.click());

  await act(async () =>
    modal
      .querySelector("button:last-child")!
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })),
  );

  expect(modal.querySelector('[role="dialog"]')).toBeNull();
  expect(closeDialog).not.toHaveBeenCalled();
});
