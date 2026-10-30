import { t } from "@shared/i18n";
import { dialog, type BrowserWindow } from "electron";

export function registerWindowRecovery(window: BrowserWindow): void {
  let prompting = false;

  window.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit" || window.isDestroyed() || prompting) return;

    prompting = true;
    void dialog
      .showMessageBox(window, {
        type: "error",
        title: t("main.windowRecovery.edaSWindowStopped"),
        message: t("main.windowRecovery.theRendererStoppedUnexpectedly"),
        detail: t("main.windowRecovery.reloadToRestoreTheLastSavedSessionUnsaved"),
        buttons: [t("main.windowRecovery.reloadEda"), t("main.windowRecovery.closeWindow")],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      .then(({ response }) => {
        if (window.isDestroyed()) return;
        if (response === 0) window.webContents.reload();
        else window.close();
      })
      .catch(() => console.error("Eda could not show renderer recovery."))
      .finally(() => {
        prompting = false;
      });
  });
}
