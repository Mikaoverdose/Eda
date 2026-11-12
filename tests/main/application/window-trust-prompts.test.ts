import { EventEmitter } from "node:events";
import { IPC_EVENTS } from "@shared/ipc";
import { WindowTrustPrompts } from "@main/application/window-trust-prompts";

const electron = vi.hoisted(() => ({ getFocusedWindow: vi.fn(), getAllWindows: vi.fn() }));
vi.mock("electron", () => ({ BrowserWindow: electron }));
describe.each([
  {
    event: IPC_EVENTS.sshHostTrustChanged,
    prompt: { host: "example.com", algorithm: "ED25519", fingerprint: `SHA256:${"a".repeat(43)}` },
  },
  {
    event: IPC_EVENTS.repositoryTrustChanged,
    prompt: { path: "/repositories/example", source: "https://example.com/repo.git" },
  },
])("$event", ({ event, prompt }) => {
  let contents: EventEmitter & {
    id: number;
    isDestroyed: () => boolean;
    send: ReturnType<typeof vi.fn>;
  };
  let window: EventEmitter & { isDestroyed: () => boolean; webContents: typeof contents };
  let prompts: WindowTrustPrompts<typeof prompt>;

  beforeEach(() => {
    vi.resetAllMocks();
    contents = Object.assign(new EventEmitter(), {
      id: 42,
      isDestroyed: () => false,
      send: vi.fn(),
    });
    window = Object.assign(new EventEmitter(), { isDestroyed: () => false, webContents: contents });
    electron.getFocusedWindow.mockReturnValue(window);
    electron.getAllWindows.mockReturnValue([window]);
    prompts = new WindowTrustPrompts(event);
  });

  it.each([false, true])(
    "sends the app's modal request and resolves only the owner's response: %s",
    async (trust) => {
      const pending = prompts.confirm(prompt, new AbortController().signal);
      const request = prompts.current(42)!;
      expect(request).toMatchObject(prompt);
      expect(contents.send).toHaveBeenCalledWith(event, request);
      expect(prompts.current(99)).toBeNull();
      expect(prompts.respond(99, request.id, true)).toBe(false);
      expect(prompts.respond(42, "another-request", true)).toBe(false);
      expect(prompts.respond(42, request.id, trust)).toBe(true);
      expect(await pending).toBe(trust);
      expect(contents.send).toHaveBeenLastCalledWith(event, null);
      expect(prompts.respond(42, request.id, true)).toBe(false);
      expect(prompts.current(42)).toBeNull();
      expect(window.listenerCount("closed")).toBe(0);
      expect(contents.listenerCount("render-process-gone")).toBe(0);
    },
  );

  it("clears the app modal and rejects late approval when the operation is cancelled", async () => {
    const controller = new AbortController();
    const pending = prompts.confirm(prompt, controller.signal);
    const request = prompts.current(42)!;
    controller.abort();
    expect(await pending).toBe(false);
    expect(contents.send).toHaveBeenLastCalledWith(event, null);
    expect(prompts.respond(42, request.id, true)).toBe(false);
  });

  it.each(["render-process-gone", "did-start-loading", "destroyed"])(
    "does not retain approval across renderer %s",
    async (event) => {
      const pending = prompts.confirm(prompt, new AbortController().signal);
      contents.emit(event);
      expect(await pending).toBe(false);
      expect(prompts.current(42)).toBeNull();
    },
  );

  it("cancels if the parent window closes", async () => {
    const pending = prompts.confirm(prompt, new AbortController().signal);
    window.emit("closed");
    expect(await pending).toBe(false);
  });

  it("does not trust when no application window is available", async () => {
    electron.getFocusedWindow.mockReturnValue(null);
    electron.getAllWindows.mockReturnValue([]);
    expect(await prompts.confirm(prompt, new AbortController().signal)).toBe(false);
    expect(contents.send).not.toHaveBeenCalled();
  });

  it("supports repository decisions without an abort signal and rejects overlapping prompts", async () => {
    const pending = prompts.confirm(prompt);
    const request = prompts.current(42)!;
    expect(await prompts.confirm(prompt)).toBe(false);
    expect(prompts.respond(42, request.id, true)).toBe(true);
    expect(await pending).toBe(true);
  });
});
