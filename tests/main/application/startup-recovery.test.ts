import { beforeEach, expect, it, vi } from "vitest";
import { ERROR_CODE } from "@shared/error-codes";
import { AppError } from "@shared/errors";
import { recoverMigrationStartup } from "@main/application/startup-recovery";

const recovery = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
  showErrorBox: vi.fn(),
  clearStartupData: vi.fn(),
  clearStorageData: vi.fn(),
  restartApplication: vi.fn(),
  exit: vi.fn(),
}));
vi.mock("@main/application/restart", () => ({
  restartApplication: recovery.restartApplication,
}));
vi.mock("electron", () => ({
  app: { getPath: () => "/eda-data", exit: recovery.exit },
  dialog: { showMessageBox: recovery.showMessageBox, showErrorBox: recovery.showErrorBox },
  session: { defaultSession: { clearStorageData: recovery.clearStorageData } },
}));
vi.mock("@main/persistence/reset-data", () => ({ clearStartupData: recovery.clearStartupData }));
beforeEach(() => {
  for (const mock of Object.values(recovery)) mock.mockReset();
  recovery.showMessageBox.mockResolvedValue({ response: 0 });
  recovery.clearStorageData.mockResolvedValue(undefined);
});

it("offers recovery for migration mismatches with a safe default and preserves data when quitting", async () => {
  expect(await recoverMigrationStartup(new AppError(ERROR_CODE.MIGRATION_HISTORY_MISMATCH))).toBe(
    true,
  );
  expect(recovery.showMessageBox).toHaveBeenCalledWith(
    expect.objectContaining({
      buttons: ["Quit", "Clear data and start over"],
      defaultId: 0,
      cancelId: 0,
      detail: expect.stringContaining("Repository files and SSH key files stay untouched"),
    }),
  );
  expect(recovery.clearStartupData).not.toHaveBeenCalled();
  expect(recovery.clearStorageData).not.toHaveBeenCalled();
  expect(recovery.restartApplication).not.toHaveBeenCalled();
  expect(recovery.exit).toHaveBeenCalledWith(1);
});

it("clears local app data and browser storage before relaunching after an explicit reset choice", async () => {
  recovery.showMessageBox.mockResolvedValue({ response: 1 });
  await recoverMigrationStartup(new AppError(ERROR_CODE.MIGRATION_HISTORY_MISMATCH));
  expect(recovery.clearStartupData).toHaveBeenCalledExactlyOnceWith("/eda-data");
  expect(recovery.clearStorageData).toHaveBeenCalledOnce();
  expect(recovery.restartApplication).toHaveBeenCalledOnce();
  expect(recovery.restartApplication).toHaveBeenCalledWith({ shutdown: "exit" });
  expect(recovery.exit).not.toHaveBeenCalled();
  expect(recovery.clearStartupData.mock.invocationCallOrder[0]).toBeLessThan(
    recovery.clearStorageData.mock.invocationCallOrder[0]!,
  );
  expect(recovery.clearStorageData.mock.invocationCallOrder[0]).toBeLessThan(
    recovery.restartApplication.mock.invocationCallOrder[0]!,
  );
});

it.each(["files", "browser storage"])(
  "reports a failure clearing %s and does not relaunch",
  async (stage) => {
    recovery.showMessageBox.mockResolvedValue({ response: 1 });
    const failure = new AppError(ERROR_CODE.INVALID_VAULT_FORMAT);
    if (stage === "files")
      recovery.clearStartupData.mockImplementation(() => {
        throw failure;
      });
    else recovery.clearStorageData.mockRejectedValue(failure);
    await recoverMigrationStartup(new AppError(ERROR_CODE.MIGRATION_HISTORY_MISMATCH));
    expect(recovery.showErrorBox).toHaveBeenCalledWith(
      "Eda could not clear its saved data",
      failure.message,
    );
    expect(recovery.restartApplication).not.toHaveBeenCalled();
    expect(recovery.exit).toHaveBeenCalledWith(1);
  },
);

it("does not offer destructive recovery for unrelated startup errors", async () => {
  expect(await recoverMigrationStartup(new AppError(ERROR_CODE.GIT_VERSION_UNSUPPORTED))).toBe(
    false,
  );
  expect(recovery.showMessageBox).not.toHaveBeenCalled();
  expect(recovery.clearStartupData).not.toHaveBeenCalled();
  expect(recovery.exit).not.toHaveBeenCalled();
});

it("reports a failed restart without attempting another restart", async () => {
  recovery.showMessageBox.mockResolvedValue({ response: 1 });
  recovery.restartApplication.mockRejectedValue(new AppError(ERROR_CODE.DEBUG_IPC_FAILURE));
  await recoverMigrationStartup(new AppError(ERROR_CODE.MIGRATION_HISTORY_MISMATCH));
  expect(recovery.showErrorBox).toHaveBeenCalledOnce();
  expect(recovery.restartApplication).toHaveBeenCalledExactlyOnceWith({ shutdown: "exit" });
  expect(recovery.exit).toHaveBeenCalledExactlyOnceWith(1);
});
