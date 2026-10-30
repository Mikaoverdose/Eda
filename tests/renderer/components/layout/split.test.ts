import {
  fractionFromPosition,
  resolveSplit,
  type SplitBounds,
} from "@renderer/components/layout/split-math";

const bounds = (total: number, minFirst = 100, minSecond = 100): SplitBounds => ({
  total,
  minFirst,
  minSecond,
});

describe("resolveSplit", () => {
  it("resolves a fraction to pixels", () => {
    expect(resolveSplit(0.6, bounds(1000))).toBe(600);
  });

  it("honours both minimums over the stored fraction", () => {
    expect(resolveSplit(0.99, bounds(1000, 100, 250))).toBe(750);
    expect(resolveSplit(0.01, bounds(1000, 300, 100))).toBe(300);
  });

  it("keeps both panes visible when the container is smaller than the minimums", () => {
    const size = resolveSplit(0.5, bounds(120, 100, 100));
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(120);
  });

  it("clamps a corrupt stored fraction instead of collapsing a pane", () => {
    expect(resolveSplit(Number.NaN, bounds(1000))).toBe(500);
    expect(resolveSplit(-5, bounds(1000))).toBe(100);
    expect(resolveSplit(12, bounds(1000))).toBe(900);
  });

  it("returns zero for an unmeasured container", () => {
    expect(resolveSplit(0.5, bounds(0))).toBe(0);
  });
});

describe("fractionFromPosition", () => {
  it("round-trips a drag position through the stored fraction", () => {
    const b = bounds(1000);
    expect(resolveSplit(fractionFromPosition(640, b), b)).toBe(640);
  });

  it("clamps a drag past a minimum", () => {
    const b = bounds(1000, 200, 150);
    expect(resolveSplit(fractionFromPosition(20, b), b)).toBe(200);
    expect(resolveSplit(fractionFromPosition(990, b), b)).toBe(850);
  });
});
