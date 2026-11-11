import { DEVELOPMENT_RESTART, type DevelopmentRestartAction } from "@shared/application";
import { app } from "electron";
import { requestDevelopmentRestart } from "./development-restart";

interface RestartOptions {
  action?: DevelopmentRestartAction;
  shutdown?: "quit" | "exit";
  relaunch?: "application" | "external";
}

export async function restartApplication({
  action = "restart",
  shutdown = "quit",
  relaunch = "application",
}: RestartOptions = {}): Promise<void> {
  // Native updaters schedule the replacement before requesting shutdown.
  if (relaunch === "application") {
    const developmentRestart =
      !app.isPackaged &&
      !!process.env["VITE_DEV_SERVER_URL"] &&
      (await requestDevelopmentRestart(action));

    if (!developmentRestart) {
      if (action === "import-release-data")
        app.relaunch({ args: [...process.argv.slice(1), DEVELOPMENT_RESTART.argument] });
      else app.relaunch();
    }
  }

  if (shutdown === "exit") app.exit(0);
  else app.quit();
}
