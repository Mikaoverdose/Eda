import { app } from "electron";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rendererDirectory = join(dirname(fileURLToPath(import.meta.url)), "../renderer");

export function isRendererFile(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:" || url.hostname) return false;
    const local = relative(rendererDirectory, fileURLToPath(url));
    return Boolean(local) && !isAbsolute(local) && local !== ".." && !local.startsWith(`..${sep}`);
  } catch {
    return false;
  }
}

export function rendererUrl(): string {
  const dev = !app.isPackaged && process.env["VITE_DEV_SERVER_URL"];
  if (dev && URL.canParse(dev)) {
    const url = new URL(dev);
    if (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password
    )
      return url.href;
  }
  return pathToFileURL(join(rendererDirectory, "index.html")).href;
}

export function isRendererDocument(value: string): boolean {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href === rendererUrl();
  } catch {
    return false;
  }
}
