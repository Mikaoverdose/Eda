import { ActionsMenu } from "@renderer/components/ui/actions/ActionsMenu";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let container: HTMLDivElement;
let root: Root;
const update = vi.fn();
const disconnect = vi.fn();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function render(disabled = false) {
  await act(async () =>
    root.render(
      <ActionsMenu
        label="Manage connection"
        disabled={disabled}
        items={[
          { label: "Update token", onSelect: update },
          { label: "Disconnect", onSelect: disconnect, danger: true },
        ]}
      />,
    ),
  );

  return container.querySelector("button")!;
}

it("renders outside resizing content and supports keyboard navigation and focus restoration", async () => {
  const trigger = await render();
  trigger.focus();
  await act(async () => trigger.click());
  const menu = document.querySelector('[role="menu"]')!;
  const items = menu.querySelectorAll("button");
  expect(container.contains(menu)).toBe(false);
  expect(document.activeElement).toBe(items[0]);

  await act(async () =>
    items[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
  );

  expect(document.activeElement).toBe(items[1]);

  await act(async () =>
    items[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );

  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("selects an action once, and closes on the trigger or an outside click", async () => {
  const trigger = await render();
  await act(async () => trigger.click());
  await act(async () => document.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click());
  expect(update).toHaveBeenCalledOnce();
  expect(disconnect).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
  await act(async () => trigger.click());
  await act(async () => trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  await act(async () => trigger.click());
  expect(document.querySelector('[role="menu"]')).toBeNull();
  await act(async () => trigger.click());

  await act(async () =>
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })),
  );

  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("keeps unavailable actions disabled", async () => {
  const trigger = await render(true);
  await act(async () => trigger.click());
  expect(document.querySelector('[role="menu"]')).toBeNull();
});
