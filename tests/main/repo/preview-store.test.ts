import { PreviewStore } from "@main/repo/preview-store";

it("retains the newest previews and allows an operation to consume its token", () => {
  const store = new PreviewStore<number>(2);
  store.set("first", 1);
  store.set("second", 2);
  expect(store.get("first")).toBe(1);
  store.set("third", 3);
  expect(store.get("first")).toBeUndefined();
  expect(store.get("second")).toBe(2);
  store.delete("second");
  expect(store.get("second")).toBeUndefined();
  expect(store.get("third")).toBe(3);
});

it("accepts a preview through its expiry instant and rejects it afterwards", () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(100);
  try {
    const store = new PreviewStore<number>(2, 50);
    store.set("preview", 1);
    clock.mockReturnValue(150);
    expect(store.get("preview")).toBe(1);
    clock.mockReturnValue(151);
    expect(store.get("preview")).toBeUndefined();
  } finally {
    clock.mockRestore();
  }
});
