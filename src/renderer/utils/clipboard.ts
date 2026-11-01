import { ERROR_CODE } from "@shared/error-codes";
import { AppError } from "@shared/errors";

function copyWithSelection(value: string): void {
  const focused = document.activeElement;
  const selection = document.getSelection();
  const ranges = Array.from({ length: selection?.rangeCount ?? 0 }, (_, index) =>
    selection!.getRangeAt(index).cloneRange(),
  );
  const input = document.createElement("textarea");
  input.value = value;
  input.readOnly = true;
  input.tabIndex = -1;
  input.className = "sr-only";
  document.body.append(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    if (!document.execCommand("copy")) throw new AppError(ERROR_CODE.CLIPBOARD_COPY_FAILED);
  } finally {
    input.remove();
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
    selection?.removeAllRanges();
    for (const range of ranges) selection?.addRange(range);
  }
}

const unavailableHandlers = new WeakSet<NonNullable<typeof window.eda.app.copyText>>();

export async function copyText(value: string): Promise<void> {
  try {
    const nativeCopy = window.eda?.app?.copyText;
    if (typeof nativeCopy === "function" && !unavailableHandlers.has(nativeCopy)) {
      try {
        const result = await nativeCopy(value);
        if (!result.ok) throw new AppError(ERROR_CODE.CLIPBOARD_COPY_FAILED);
        return;
      } catch (error) {
        // Older main processes may not have this handler. Electron only gives us a message.
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("No handler registered for 'app:copy-text'")) throw error;
        unavailableHandlers.add(nativeCopy);
      }
    }
    copyWithSelection(value);
  } catch {
    throw new AppError(ERROR_CODE.CLIPBOARD_COPY_FAILED);
  }
}
