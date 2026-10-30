import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import { IPC_EVENTS } from "@shared/ipc";
import type { SshHostTrustRequest } from "@shared/identity/ssh";
import type { ConfirmSshHost } from "../git/security/ssh-host-trust";

export class SshHostTrustPrompts {
  private pending: {
    request: SshHostTrustRequest;
    windowId: number;
    finish: (trust: boolean) => void;
  } | null = null;

  current(windowId: number): SshHostTrustRequest | null {
    return this.pending?.windowId === windowId ? this.pending.request : null;
  }

  respond(windowId: number, id: string, trust: boolean): boolean {
    const pending = this.pending;
    if (!pending || pending.windowId !== windowId || pending.request.id !== id) return false;
    pending.finish(trust);
    return true;
  }

  readonly confirm: ConfirmSshHost = (prompt, signal) => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!window || window.isDestroyed() || signal.aborted || this.pending)
      return Promise.resolve(false);
    const contents = window.webContents;
    if (contents.isDestroyed()) return Promise.resolve(false);
    const request: SshHostTrustRequest = { ...prompt, id: randomUUID() };

    return new Promise<boolean>((resolve) => {
      const cancel = () => finish(false);
      const finish = (trust: boolean) => {
        if (this.pending?.request.id !== request.id) return;
        this.pending = null;
        signal.removeEventListener("abort", cancel);
        window.off("closed", cancel);
        contents.off("render-process-gone", cancel);
        contents.off("did-start-loading", cancel);
        contents.off("destroyed", cancel);
        if (!contents.isDestroyed()) {
          try {
            contents.send(IPC_EVENTS.sshHostTrustChanged, null);
          } catch {}
        }
        resolve(trust && !signal.aborted);
      };
      this.pending = { request, windowId: contents.id, finish };
      signal.addEventListener("abort", cancel, { once: true });
      window.once("closed", cancel);
      contents.once("render-process-gone", cancel);
      contents.once("did-start-loading", cancel);
      contents.once("destroyed", cancel);
      try {
        contents.send(IPC_EVENTS.sshHostTrustChanged, request);
      } catch {
        finish(false);
      }
    });
  };
}
