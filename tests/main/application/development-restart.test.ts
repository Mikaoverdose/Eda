import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { DEVELOPMENT_RESTART } from "@shared/application";
import { requestDevelopmentRestart } from "@main/application/development-restart";

function host() {
  return Object.assign(new EventEmitter(), {
    connected: true,
    send: vi.fn((_message: unknown, callback?: (error: Error | null) => void) => {
      callback?.(null);
      return true;
    }),
  });
}

afterEach(() => vi.useRealTimers());

it("waits for Vite to prepare the restart before allowing the app to quit", async () => {
  const parent = host();
  const finished = vi.fn();
  const restart = requestDevelopmentRestart("restart", parent).then(finished);
  expect(parent.send).toHaveBeenCalledWith(DEVELOPMENT_RESTART.request, expect.any(Function));
  parent.emit("message", "unrelated");
  await Promise.resolve();
  expect(finished).not.toHaveBeenCalled();
  parent.emit("message", DEVELOPMENT_RESTART.ready);
  await restart;
  expect(finished).toHaveBeenCalledWith(true);
  expect(parent.listenerCount("message")).toBe(0);
  expect(parent.listenerCount("disconnect")).toBe(0);
});

it("allows a direct relaunch when Electron was not started by a parent with IPC", async () => {
  const parent = host();
  parent.connected = false;
  expect(await requestDevelopmentRestart("restart", parent)).toBe(false);
  expect(parent.send).not.toHaveBeenCalled();
});

it.each(["disconnect", "timeout", "send failure"] as const)(
  "reports %s and removes restart listeners instead of quitting without a host",
  async (failure) => {
    vi.useFakeTimers();
    const parent = host();
    if (failure === "send failure")
      parent.send.mockImplementationOnce((_message, callback) => {
        callback?.(new Error("fixture send failure"));
        return false;
      });
    const restart = requestDevelopmentRestart("restart", parent);
    const rejected = expect(restart).rejects.toThrow("development server could not prepare");
    if (failure === "disconnect") parent.emit("disconnect");
    if (failure === "timeout") await vi.advanceTimersByTimeAsync(5_000);
    await rejected;
    expect(parent.listenerCount("message")).toBe(0);
    expect(parent.listenerCount("disconnect")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("requests the import startup argument only when copying release data", async () => {
  const parent = host();
  const restart = requestDevelopmentRestart("import-release-data", parent);
  expect(parent.send).toHaveBeenCalledWith(DEVELOPMENT_RESTART.importRequest, expect.any(Function));
  parent.emit("message", DEVELOPMENT_RESTART.ready);
  expect(await restart).toBe(true);
});
