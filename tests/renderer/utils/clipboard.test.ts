import { copyText } from "@renderer/utils/clipboard";
import { err, ok } from "@shared/errors";

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "execCommand");
  document.body.replaceChildren();
});

it("copies exact text natively without browser clipboard permission", async () => {
  const nativeCopy = vi.fn().mockResolvedValue(ok(undefined));
  vi.stubGlobal("eda", { app: { copyText: nativeCopy } });
  const value = "src/a file.ts\nこんにちは";
  await copyText(value);
  expect(nativeCopy).toHaveBeenCalledExactlyOnceWith(value);
  expect(document.querySelector("textarea")).toBeNull();
});

it.each([
  () => Promise.resolve(err({ kind: "unknown", operation: "copy", message: "Native failure" })),
  () => Promise.reject(new Error("Write permission denied")),
])("reports a friendly failure and allows a native retry", async (failure) => {
  const nativeCopy = vi.fn().mockImplementationOnce(failure).mockResolvedValue(ok(undefined));
  vi.stubGlobal("eda", { app: { copyText: nativeCopy } });
  await expect(copyText("text")).rejects.toThrow("Clipboard copy failed");
  await expect(copyText("text")).resolves.toBeUndefined();
  expect(nativeCopy).toHaveBeenCalledTimes(2);
});

it("restores focus and selection and removes the temporary input when fallback fails", async () => {
  vi.stubGlobal("eda", { app: {} });
  const button = document.createElement("button");
  const text = document.createElement("p");
  text.textContent = "selected text";
  document.body.append(button, text);
  button.focus();
  const range = document.createRange();
  range.selectNodeContents(text);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  const execCommand = vi.fn(() => false);
  Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
  await expect(copyText("text")).rejects.toThrow("Clipboard copy failed");
  expect(execCommand).toHaveBeenCalledExactlyOnceWith("copy");
  expect(document.activeElement).toBe(button);
  expect(selection.toString()).toBe("selected text");
  expect(document.querySelector("textarea")).toBeNull();
});
