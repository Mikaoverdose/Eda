import { errorFixture } from "../helpers/error";
import type * as fs from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const startup = vi.hoisted(() => ({
  createServices: vi.fn(),
  showErrorBox: vi.fn(),
  exit: vi.fn(),
  hasSwitch: vi.fn(() => false),
  setPath: vi.fn(),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof fs>()),
  existsSync: startup.existsSync,
  mkdirSync: startup.mkdirSync,
  renameSync: startup.renameSync,
}));
vi.mock("@main/services", () => ({ createServices: startup.createServices }));
vi.mock("@main/ipc/register", () => ({ registerIpcHandlers: vi.fn() }));
vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    commandLine: { hasSwitch: startup.hasSwitch },
    getPath: () => "/eda-test-missing-user-data",
    setPath: startup.setPath,
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    getPreferredSystemLanguages: () => ["en-US"],
    on: vi.fn(),
    exit: startup.exit,
  },
  BrowserWindow: vi.fn(),
  dialog: { showErrorBox: startup.showErrorBox },
  Menu: { setApplicationMenu: vi.fn() },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
  shell: {},
}));

beforeEach(() => {
  startup.createServices.mockImplementation(() => new Promise(() => {}));
  startup.existsSync.mockReturnValue(false);
  vi.stubEnv("VITE_DEV_SERVER_URL", "");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each([
  { devServer: "", name: "Eda" },
  { devServer: "http://localhost:5173", name: "Eda-Dev" },
])("preserves existing data when renaming the $name directory", async ({ devServer, name }) => {
  vi.stubEnv("VITE_DEV_SERVER_URL", devServer);
  startup.existsSync.mockImplementation((path?: unknown) =>
    String(path).endsWith(name.toLowerCase()),
  );
  const userData = `/eda-test-missing-user-data/${name}`;

  await import("@main/index");

  expect(startup.renameSync).toHaveBeenCalledExactlyOnceWith(userData.toLowerCase(), userData);
  expect(startup.setPath).toHaveBeenCalledExactlyOnceWith("userData", userData);
});

it("keeps an existing capitalized data directory without replacing it", async () => {
  startup.existsSync.mockReturnValue(true);

  await import("@main/index");

  expect(startup.renameSync).not.toHaveBeenCalled();
  expect(startup.setPath).toHaveBeenCalledWith("userData", "/eda-test-missing-user-data/Eda");
});

it("preserves an explicit user-data-dir override", async () => {
  startup.hasSwitch.mockReturnValueOnce(true);

  await import("@main/index");

  expect(startup.mkdirSync).not.toHaveBeenCalled();
  expect(startup.renameSync).not.toHaveBeenCalled();
  expect(startup.setPath).not.toHaveBeenCalled();
});

it("reports a missing Git installation visibly and exits instead of remaining windowless", async () => {
  const { GitError } = await import("@shared/errors");
  const failure = new GitError(
    errorFixture({
      kind: "git-not-found",
      operation: "locate Git",
      message: "Eda could not find a working Git installation.",
      suggestedAction: "Install Git and restart Eda.",
    }),
  );

  startup.createServices.mockRejectedValueOnce(failure);

  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

  await import("@main/index");

  await vi.waitFor(() => expect(startup.exit).toHaveBeenCalledWith(1));
  expect(startup.showErrorBox).toHaveBeenCalledExactlyOnceWith(
    "Eda could not start",
    `${failure.message}\n\n${failure.suggestedAction}`,
  );
  expect(log).toHaveBeenCalledWith("Eda could not start:", failure.message);
  expect(startup.showErrorBox.mock.invocationCallOrder[0]).toBeLessThan(
    startup.exit.mock.invocationCallOrder[0]!,
  );
});
