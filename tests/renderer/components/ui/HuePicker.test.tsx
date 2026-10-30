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
