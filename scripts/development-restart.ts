import type { ChildProcess } from "node:child_process";
import { DEVELOPMENT_RESTART, type DevelopmentRestartAction } from "../src/shared/application.ts";

export function watchDevelopmentRestart(
  child: ChildProcess,
  stop: () => Promise<void>,
  restart: (action: DevelopmentRestartAction) => Promise<void>,
  onError: (error: unknown) => void,
): void {
  let requested = false;

  child.on("message", (message) => {
    if (
      requested ||
      (message !== DEVELOPMENT_RESTART.request && message !== DEVELOPMENT_RESTART.importRequest)
    )
      return;
    const action =
      message === DEVELOPMENT_RESTART.importRequest ? "import-release-data" : "restart";
    requested = true;

    void (async () => {
      // The planned stop must be registered before Electron quits, or Vite exits too.
      const stopped = stop();
      child.send?.(DEVELOPMENT_RESTART.ready);
      await stopped;
      await restart(action);
    })().catch(onError);
  });
}
