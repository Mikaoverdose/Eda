import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { registerWindowRecovery } from "@main/application/window-recovery";

const showMessageBox = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({ dialog: { showMessageBox } }));

afterEach(() => vi.resetAllMocks());

it("offers native recovery after a crash, reloads on request, and ignores closed windows", async () => {
  const reload = vi.fn();
  const close = vi.fn();
  const isDestroyed = vi.fn(() => false);
  const contents = Object.assign(new EventEmitter(), { reload });
  const window = { webContents: contents, isDestroyed, close } as unknown as BrowserWindow;

  registerWindowRecovery(window);
  contents.emit("render-process-gone", {}, { reason: "clean-exit" });
  expect(showMessageBox).not.toHaveBeenCalled();

  let respond!: (value: { response: number }) => void;

  showMessageBox.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
  );
  contents.emit("render-process-gone", {}, { reason: "crashed" });
  contents.emit("render-process-gone", {}, { reason: "killed" });
  expect(showMessageBox).toHaveBeenCalledOnce();

  respond({ response: 0 });
  await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());

  showMessageBox.mockResolvedValueOnce({ response: 1 });
  contents.emit("render-process-gone", {}, { reason: "oom" });
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());

  showMessageBox.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
  );
  contents.emit("render-process-gone", {}, { reason: "crashed" });
  isDestroyed.mockReturnValue(true);
  respond({ response: 0 });
  await vi.waitFor(() => expect(showMessageBox).toHaveResolvedTimes(3));
  expect(reload).toHaveBeenCalledOnce();
});
