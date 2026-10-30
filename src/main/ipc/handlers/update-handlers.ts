import { t } from "@shared/i18n";
import { BrowserWindow } from "electron";
import { ok } from "@shared/errors";
import { IPC_CHANNELS, IPC_EVENTS } from "@shared/ipc";
import type { Services } from "../../services";
import { broadcast, handle } from "../transport";
import { invalidRequest } from "../request-errors";

export function registerUpdateHandlers(services: Services): void {
  const { updates } = services;
  updates.onChange((state) => broadcast(IPC_EVENTS.updateChanged, state));
  const caller = (event: Electron.IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed() || event.senderFrame !== event.sender.mainFrame)
      throw invalidRequest(t("main.updateHandlers.updatesRequireTheApplicationWindow"));
  };
  handle(IPC_CHANNELS.updatesState, async (event) => {
    caller(event);
    return ok(updates.snapshot());
  });
  handle(IPC_CHANNELS.updatesCheck, async (event) => {
    caller(event);
    return ok(await updates.check());
  });
  handle(IPC_CHANNELS.updatesDownload, async (event) => {
    caller(event);
    return ok(await updates.download());
  });
  handle(IPC_CHANNELS.updatesCancel, async (event) => {
    caller(event);
    return ok(await updates.cancel());
  });
  handle(IPC_CHANNELS.updatesInstall, async (event) => {
    caller(event);
    return ok(await updates.install());
  });
}
