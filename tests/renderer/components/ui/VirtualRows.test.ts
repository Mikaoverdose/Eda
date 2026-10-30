import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  MAX_RENDERED_ROWS,
  getVirtualRange,
  VirtualRows,
} from "@renderer/components/ui/display/VirtualRows";

describe("virtual row bounds", () => {
  it("clamps both ends", () => {
    expect(getVirtualRange(4, 0, 100, 20)).toEqual({ start: 0, end: 4 });
    expect(getVirtualRange(4, 10_000, 100, 20)).toEqual({ start: 4, end: 4 });
  });

  it("never exceeds the cap even when the viewport is taller than it", () => {
    const range = getVirtualRange(1_000_000, 6_000, 4_000, 30);
    expect(range.end - range.start).toBe(MAX_RENDERED_ROWS);
  });
});

it("renders only the intersection of the viewport and retained history pages", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const items = Array.from({ length: 100 }, (_, index) => `commit-${index + 50}`);
  const renderRow = (item: string, index: number) =>
    createElement("div", { key: item, "data-row": index }, item);

  try {
    await act(async () =>
      root.render(
        createElement(VirtualRows<string>, {
          items,
          itemOffset: 50,
          totalCount: 200,
          rowHeight: 20,
          renderRow,
        }),
      ),
    );
    const region = container.querySelector<HTMLElement>('[role="region"]')!;
    expect(container.querySelectorAll("[data-row]")).toHaveLength(0);
    expect(region.dataset["mountedCount"]).toBe("0");

    await act(async () => {
      region.scrollTop = 60 * 20;
      region.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-row]"));
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every((row) => Number(row.dataset["row"]) >= 50 && Number(row.dataset["row"]) < 150),
    ).toBe(true);
    expect(Number(region.dataset["mountedCount"])).toBe(rows.length);

    await act(async () => {
      region.scrollTop = 190 * 20;
      region.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    expect(container.querySelectorAll("[data-row]")).toHaveLength(0);
    expect(region.dataset["mountedCount"]).toBe("0");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
