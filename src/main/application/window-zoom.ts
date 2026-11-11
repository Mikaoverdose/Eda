import { BrowserWindow, type WebContents } from "electron";

const TITLEBAR_HEIGHT = 44;
const WINDOW_BUTTON_HEIGHT = 14;

export function applyWindowZoom(contents: WebContents, factor: number): void {
  if (Math.abs(contents.getZoomFactor() - factor) > 0.001) contents.setZoomFactor(factor);

  if (process.platform === "darwin") {
    BrowserWindow.fromWebContents(contents)?.setWindowButtonPosition({
      x: 12,
      y: (TITLEBAR_HEIGHT - WINDOW_BUTTON_HEIGHT) / 2,
    });
  }
}
