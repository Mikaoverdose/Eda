import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Fingerprint } from "@renderer/components/ui/display/Fingerprint";
import { RadioCard } from "@renderer/components/ui/forms/RadioCard";
import { ok } from "@shared/errors";

const gpg = "0123456789ABCDEF0123456789ABCDEF01234567";
const ssh = "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
let root: Root;
let container: HTMLDivElement;
const copy = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  copy.mockReset().mockResolvedValue(ok(undefined));
  vi.stubGlobal("eda", { app: { copyText: copy } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each([gpg, ssh])("reveals and copies the full fingerprint %s", async (value) => {
  await act(async () => root.render(<Fingerprint value={value} />));
  const trigger = container.querySelector("button")!;
  expect(trigger.textContent).not.toBe(value);
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  await act(async () => trigger.focus());
  const tooltip = document.querySelector('[role="tooltip"]')!;
  expect(tooltip.textContent).toBe(value);
  expect(trigger.getAttribute("aria-describedby")).toBe(tooltip.id);
  expect(container.contains(tooltip)).toBe(false);
  await act(async () => container.querySelectorAll<HTMLButtonElement>("button")[1]!.click());
  expect(copy).toHaveBeenCalledExactlyOnceWith(value);
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("keeps the hover detail available while moving onto it and closes when leaving", async () => {
  await act(async () => root.render(<Fingerprint value={gpg} shortValue={gpg.slice(-16)} />));
  const trigger = container.querySelector("button")!;
  await act(async () => trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  const tooltip = document.querySelector('[role="tooltip"]')!;
  expect(tooltip.textContent).toBe(gpg);
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: tooltip }));
    tooltip.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: trigger }));
    await vi.advanceTimersByTimeAsync(150);
  });
  expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  await act(async () => {
    tooltip.dispatchEvent(
      new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
    );
    await vi.advanceTimersByTimeAsync(150);
  });
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
});

it("keeps fingerprint actions outside the radio label and does not select an unselected key", async () => {
  const change = vi.fn();
  await act(async () =>
    root.render(
      <div role="radiogroup" aria-label="Keys">
        <RadioCard
          name="key"
          value="other"
          checked={false}
          variant="row"
          onChange={change}
          actions={<Fingerprint value={gpg} />}
        >
          Other signing key
        </RadioCard>
      </div>,
    ),
  );
  const buttons = container.querySelectorAll<HTMLButtonElement>("button");
  expect(buttons[0]!.closest("label")).toBeNull();
  expect(buttons[1]!.closest("label")).toBeNull();
  await act(async () => buttons[1]!.click());
  expect(copy).toHaveBeenCalledWith(gpg);
  expect(change).not.toHaveBeenCalled();
  expect(container.querySelector<HTMLInputElement>('input[type="radio"]')!.checked).toBe(false);
});
