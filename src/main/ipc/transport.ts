import { errorText } from "@shared/error-codes";
import { AppError, GitError, err, type Result } from "@shared/errors";
import { t } from "@shared/i18n";
import { IPC_CHANNELS, type IPC_EVENTS, type IpcChannel } from "@shared/ipc";
import { BrowserWindow, ipcMain } from "electron";

let activeRequests = 0;
let resetting = false;
let installingUpdate = false;

export function beginUpdateInstall(): () => void {
  if (resetting || installingUpdate || activeRequests > 1)
    throw new GitError({
      kind: "invalid-input",
      operation: t("operations.installUpdate"),
      message: errorText("main.transport.waitForOtherRequestsToFinishThenInstallTheUpdateAgain"),
    });
  installingUpdate = true;
  return () => {
    installingUpdate = false;
  };
}

export async function exclusivelyReset(work: () => Promise<void>): Promise<void> {
  if (resetting || installingUpdate || activeRequests > 1)
    throw new GitError({
      kind: "invalid-input",
      operation: t("operations.resetAppData"),
      message: errorText("main.transport.waitForOtherRequestsToFinishThenResetEdaAgain"),
    });
  resetting = true;
  try {
    await work();
  } finally {
    resetting = false;
  }
}

type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<Result<unknown>>;

export function handle(channel: IpcChannel, handler: Handler): void {
  ipcMain.handle(channel, async (event, ...args) => {
    const savingForUpdate =
      channel === IPC_CHANNELS.sessionsChange || channel === IPC_CHANNELS.sessionsReadyToClose;
    if (resetting || (installingUpdate && !savingForUpdate))
      return err({
        kind: "invalid-input",
        operation: channel,
        message: installingUpdate
          ? errorText("main.transport.edaIsRestartingToInstallAnUpdatePleaseWait")
          : errorText("main.transport.edaIsResettingPleaseWait"),
      });
    activeRequests++;
    try {
      return await handler(event, ...args);
    } catch (error) {
      if (error instanceof GitError) return err(error);
      console.error(`IPC handler ${channel} failed unexpectedly.`);
      if (error instanceof AppError)
        return err({
          kind: "unknown",
          operation: channel,
          code: error.code,
          message: error.text,
        });

      return err({
        kind: "unknown",
        operation: channel,
        message: errorText("main.transport.somethingWentWrongInsideEda"),
        suggestedAction: errorText("main.transport.ifThisKeepsHappeningPleaseReportItWithTheLog"),
      });
    } finally {
      activeRequests--;
    }
  });
}

export function broadcast(
  channel: (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS],
  ...args: unknown[]
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, ...args);
  }
}
