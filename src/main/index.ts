import { t, setLocale } from "@shared/i18n";
import { configureGraphics } from "./application/graphics";
import { app, BrowserWindow, dialog, Menu, shell, session } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerIpcHandlers } from "./ipc/register";
import { createServices } from "./services";
import { registerWindowRecovery } from "./application/window-recovery";
import { GitError } from "@shared/errors";
import { redactDiagnostic } from "@shared/diagnostics";
import {
  navigationFromArguments,
  parseRepositoryLink,
  type RepositoryNavigationQueue,
} from "./repo/lifecycle/navigation";

let navigation: RepositoryNavigationQueue | undefined;
const pendingLinks: string[] = [];

app.on("open-url", (event, url) => {
  event.preventDefault();
  const target = parseRepositoryLink(url);
  if (!target) return;
  if (navigation) navigation.push([target]);
  else pendingLinks.push(url);
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

const CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'" + (isDev ? " 'unsafe-inline'" : ""),
  "img-src 'self' data: https://www.gravatar.com",
  "font-src 'self' data:",
  "connect-src 'self'" + (isDev ? " ws://localhost:*" : ""),
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function createWindow(zoom = 100): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: "#0E1014",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      webSecurity: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  registerWindowRecovery(window);

  if (isDev)
    window.webContents.on("console-message", (event) => {
      if (event.message.startsWith("[Eda navigation] ")) console.info(event.message);
    });

  window.webContents.setZoomFactor(zoom / 100);

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const isDevServer = isDev && url.startsWith(process.env["VITE_DEV_SERVER_URL"] ?? "\0");
    if (!isDevServer && url !== window.webContents.getURL()) event.preventDefault();
  });

  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );

  const devServerUrl = process.env["VITE_DEV_SERVER_URL"];

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv, cwd) => {
    navigation?.push(navigationFromArguments(argv.slice(app.isPackaged ? 1 : 2), cwd));
    const [existing] = BrowserWindow.getAllWindows();
    if (!existing) return;
    if (existing.isMinimized()) existing.restore();
    existing.focus();
  });

  void start();
}

async function start(): Promise<void> {
  try {
    configureGraphics();
    await app.whenReady();
    setLocale(app.getPreferredSystemLanguages());

    if (process.platform !== "darwin") Menu.setApplicationMenu(null);

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            details.resourceType === "subFrame" &&
            details.url ===
              new URL(
                "index.html?eda-tour=1",
                process.env["VITE_DEV_SERVER_URL"] ||
                  pathToFileURL(join(__dirname, "../renderer/index.html")).href,
              ).href
              ? CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'")
              : CSP,
          ],
        },
      });
    });

    const services = await createServices();

    navigation = services.navigation;
    navigation.push([
      ...navigationFromArguments(process.argv.slice(app.isPackaged ? 1 : 2), process.cwd()),
      ...pendingLinks.flatMap((link) => {
        const target = parseRepositoryLink(link);
        return target ? [target] : [];
      }),
    ]);

    if (app.isPackaged) app.setAsDefaultProtocolClient("eda");

    registerIpcHandlers(services);
    services.backgroundFetch.start();
    services.updates.start();

    let backgroundStopped = false;

    app.on("before-quit", (event) => {
      services.updates.stop();
      services.github.cancelAll();
      if (backgroundStopped) return;
      event.preventDefault();
      void services.backgroundFetch
        .stop()
        .finally(() => services.sshAgent.stop())
        .finally(() => {
          backgroundStopped = true;
          app.quit();
        });
    });
    app.once("will-quit", () => services.db.close());

    createWindow(
      services.preferences.resolve(
        "uiZoom",
        services.identity.getActive() ? { profileId: services.identity.getActive()!.id } : {},
      ).value,
    );

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0)
        createWindow(
          services.preferences.resolve(
            "uiZoom",
            services.identity.getActive() ? { profileId: services.identity.getActive()!.id } : {},
          ).value,
        );
    });
  } catch (error) {
    const message = redactDiagnostic(error instanceof Error ? error.message : String(error));
    console.error("Eda could not start:", message);
    const action = error instanceof GitError ? error.suggestedAction : undefined;
    dialog.showErrorBox(
      t("main.index.edaCouldNotStart"),
      [message, action].filter(Boolean).join("\n\n"),
    );
    app.exit(1);
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => event.preventDefault());
});
