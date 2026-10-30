import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CopyButton } from "@renderer/components/ui/actions/CopyButton";
import { ACTION_FEEDBACK } from "@renderer/motion";
import { err, ok } from "@shared/errors";

let root: Root;
let container: HTMLDivElement;
const writeText = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("eda", { app: { copyText: writeText } });
  writeText.mockReset().mockResolvedValue(ok(undefined));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "execCommand");
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const glyph = (name: string) => container.querySelector(`.ui-action-visible .lucide-${name}`);
const advance = (duration: number) => act(async () => vi.advanceTimersByTimeAsync(duration));
const click = () => act(async () => container.querySelector("button")!.click());
const copy = async () => {
  await click();
  await advance(ACTION_FEEDBACK.minimumPending);
};

it("shows only copy, spinner, check, then copy again using the shared action timing", async () => {
  await act(async () => root.render(<CopyButton value="ABCD-EFGH" />));
  expect(glyph("copy")).not.toBeNull();
  expect(container.querySelector("button")!.textContent).toBe("");
  await click();
  expect(glyph("loader-circle")).not.toBeNull();
  expect(container.querySelector("button")!.getAttribute("aria-busy")).toBe("true");
  await advance(ACTION_FEEDBACK.minimumPending);
  expect(writeText).toHaveBeenCalledExactlyOnceWith("ABCD-EFGH");
  expect(glyph("check")).not.toBeNull();
  await advance(ACTION_FEEDBACK.outcomeHold);
  expect(glyph("copy")).not.toBeNull();
  await act(async () => root.render(<CopyButton value="IJKL-MNOP" />));
  await copy();
  expect(writeText).toHaveBeenLastCalledWith("IJKL-MNOP");
});

it("briefly confirms an automatic copy without keeping the check permanently", async () => {
  await act(async () => root.render(<CopyButton value="code" copied />));
  expect(glyph("check")).not.toBeNull();
  await advance(ACTION_FEEDBACK.outcomeHold);
  expect(glyph("copy")).not.toBeNull();
  expect(writeText).not.toHaveBeenCalled();
});

it("shows an X on clipboard failure, then resets and permits retry", async () => {
  writeText.mockResolvedValueOnce(
    err({ kind: "unknown", operation: "copy", message: "Clipboard unavailable" }),
  );
  await act(async () => root.render(<CopyButton value="code" />));
  await copy();
  expect(glyph("x")).not.toBeNull();
  expect(container.querySelector("button")!.textContent).toBe("");
  await advance(ACTION_FEEDBACK.outcomeHold);
  expect(glyph("copy")).not.toBeNull();
  await copy();
  expect(glyph("check")).not.toBeNull();
});

it("copies during a renderer update when the existing preload has no copy API", async () => {
  vi.stubGlobal("eda", { app: {} });
  const focused = document.createElement("button");
  document.body.append(focused);
  focused.focus();
  const execCommand = vi.fn(() => {
    expect((document.activeElement as HTMLTextAreaElement).value).toBe("ABCD-EFGH");
    return true;
  });
  Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
  await act(async () => root.render(<CopyButton value="ABCD-EFGH" />));
  await copy();
  expect(execCommand).toHaveBeenCalledExactlyOnceWith("copy");
  expect(glyph("check")).not.toBeNull();
  expect(document.querySelector("textarea")).toBeNull();
  expect(document.activeElement).toBe(focused);
  focused.remove();
});

it("copies when the running main process has no handler and stops retrying that handler", async () => {
  writeText.mockRejectedValue(
    new Error(
      "Error invoking remote method 'app:copy-text': Error: No handler registered for 'app:copy-text'",
    ),
  );
  const execCommand = vi.fn(() => true);
  Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
  await act(async () => root.render(<CopyButton value="ABCD-EFGH" />));
  await copy();
  expect(glyph("check")).not.toBeNull();
  await copy();
  expect(writeText).toHaveBeenCalledOnce();
  expect(execCommand).toHaveBeenCalledTimes(2);
  expect(glyph("check")).not.toBeNull();
});
