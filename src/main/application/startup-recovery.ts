import { ERROR_CODE } from "@shared/error-codes";
import { AppError, errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { app, dialog, session } from "electron";
import { restartApplication } from "./restart";
import { clearStartupData } from "../persistence/reset-data";

export async function recoverMigrationStartup(error: unknown): Promise<boolean> {
  if (!(error instanceof AppError) || error.code !== ERROR_CODE.MIGRATION_HISTORY_MISMATCH)
    return false;

  try {
    const { response } = await dialog.showMessageBox({
      type: "warning",
      title: t("main.startupRecovery.title"),
      message: t("main.startupRecovery.message"),
      detail: t("main.startupRecovery.detail"),
      buttons: [t("main.startupRecovery.quit"), t("main.startupRecovery.clearData")],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (response !== 1) {
      app.exit(1);
      return true;
    }
    clearStartupData(app.getPath("userData"));
    await session.defaultSession.clearStorageData();
    await restartApplication({ shutdown: "exit" });
  } catch (failure) {
    dialog.showErrorBox(t("main.startupRecovery.resetFailed"), errorMessage(failure));
    app.exit(1);
  }
  return true;
}
