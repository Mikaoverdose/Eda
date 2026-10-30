import { afterEach, expect, it, vi } from "vitest";
import { GitError } from "@shared/errors";

const startup = vi.hoisted(() => ({
  createServices: vi.fn(),
  showErrorBox: vi.fn(),
  exit: vi.fn(),
}));

vi.mock("@main/services", () => ({ createServices: startup.createServices }));
vi.mock("@main/ipc/register", () => ({ registerIpcHandlers: vi.fn() }));
vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: () => "/eda-test-missing-user-data",
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

afterEach(() => vi.restoreAllMocks());

it("reports a missing Git installation visibly and exits instead of remaining windowless", async () => {
  const failure = new GitError({
    kind: "git-not-found",
    operation: "locate Git",
    message: "Eda could not find a working Git installation.",
    suggestedAction: "Install Git and restart Eda.",
  });

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
