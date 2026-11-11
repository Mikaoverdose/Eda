import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { DEVELOPMENT_RESTART } from "@shared/application";
import { restartApplication } from "@main/application/restart";

const runtime = vi.hoisted(() => ({
  app: { isPackaged: false, relaunch: vi.fn(), quit: vi.fn(), exit: vi.fn() },
  requestDevelopmentRestart: vi.fn(),
}));
vi.mock("electron", () => ({ app: runtime.app }));
vi.mock("@main/application/development-restart", () => ({
  requestDevelopmentRestart: runtime.requestDevelopmentRestart,
}));

beforeEach(() => {
  vi.clearAllMocks();
  runtime.app.isPackaged = false;
  runtime.requestDevelopmentRestart.mockResolvedValue(true);
  vi.stubEnv("VITE_DEV_SERVER_URL", "http://localhost:5173");
});
afterEach(() => vi.unstubAllEnvs());

it.each(["restart", "import-release-data"] as const)(
  "waits for the development host before quitting for %s",
  async (action) => {
    let acknowledge!: (ready: boolean) => void;
    runtime.requestDevelopmentRestart.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const restart = restartApplication({ action });
    expect(runtime.requestDevelopmentRestart).toHaveBeenCalledWith(action);
    expect(runtime.app.quit).not.toHaveBeenCalled();
    acknowledge(true);
    await restart;
    expect(runtime.app.quit).toHaveBeenCalledOnce();
    expect(runtime.app.relaunch).not.toHaveBeenCalled();
    expect(runtime.app.exit).not.toHaveBeenCalled();
  },
);

it.each(["packaged", "standalone", "no IPC"] as const)(
  "schedules an Electron relaunch for a %s app",
  async (mode) => {
    if (mode === "packaged") runtime.app.isPackaged = true;
    if (mode === "standalone") vi.stubEnv("VITE_DEV_SERVER_URL", "");
    if (mode === "no IPC") runtime.requestDevelopmentRestart.mockResolvedValueOnce(false);
    await restartApplication();
    expect(runtime.app.relaunch).toHaveBeenCalledExactlyOnceWith();
    expect(runtime.app.quit).toHaveBeenCalledOnce();
    expect(runtime.app.relaunch.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.app.quit.mock.invocationCallOrder[0]!,
    );
    if (mode !== "no IPC") expect(runtime.requestDevelopmentRestart).not.toHaveBeenCalled();
  },
);

it("preserves the launch arguments and adds the import flag for a standalone import", async () => {
  runtime.requestDevelopmentRestart.mockResolvedValueOnce(false);
  await restartApplication({ action: "import-release-data" });
  expect(runtime.app.relaunch).toHaveBeenCalledWith({
    args: [...process.argv.slice(1), DEVELOPMENT_RESTART.argument],
  });
});

it("exits immediately after scheduling startup recovery instead of running the normal quit handshake", async () => {
  runtime.app.isPackaged = true;
  await restartApplication({ shutdown: "exit" });
  expect(runtime.app.relaunch).toHaveBeenCalledOnce();
  expect(runtime.app.exit).toHaveBeenCalledExactlyOnceWith(0);
  expect(runtime.app.quit).not.toHaveBeenCalled();
  expect(runtime.app.relaunch.mock.invocationCallOrder[0]).toBeLessThan(
    runtime.app.exit.mock.invocationCallOrder[0]!,
  );
});

it("only quits when an external updater already scheduled the replacement", async () => {
  await restartApplication({ relaunch: "external" });
  expect(runtime.app.quit).toHaveBeenCalledOnce();
  expect(runtime.requestDevelopmentRestart).not.toHaveBeenCalled();
  expect(runtime.app.relaunch).not.toHaveBeenCalled();
});

it("leaves the app running when the development host cannot prepare a restart", async () => {
  runtime.requestDevelopmentRestart.mockRejectedValueOnce(new Error("fixture host failure"));
  await expect(restartApplication()).rejects.toThrow("fixture host failure");
  expect(runtime.app.quit).not.toHaveBeenCalled();
  expect(runtime.app.exit).not.toHaveBeenCalled();
  expect(runtime.app.relaunch).not.toHaveBeenCalled();
});
