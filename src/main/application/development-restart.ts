import { DEVELOPMENT_RESTART, type DevelopmentRestartAction } from "@shared/application";
import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";

interface DevelopmentHost {
  connected: boolean;
  on(event: "message" | "disconnect", listener: (message?: unknown) => void): unknown;
  off(event: "message" | "disconnect", listener: (message?: unknown) => void): unknown;
  send?: ((message: string, callback: (error: Error | null) => void) => boolean) | undefined;
}

export async function requestDevelopmentRestart(
  action: DevelopmentRestartAction = "restart",
  host: DevelopmentHost = process,
): Promise<boolean> {
  const send = host.send;
  if (!send || !host.connected) return false;

  await new Promise<void>((resolve, reject) => {
    const fail = () => {
      cleanup();
      reject(
        new GitError({
          kind: "invalid-input",
          operation: t("operations.restartApp"),
          message: errorText("main.appData.restartUnavailable"),
        }),
      );
    };
    const onMessage = (message: unknown) => {
      if (message !== DEVELOPMENT_RESTART.ready) return;
      cleanup();
      resolve();
    };
    const timeout = setTimeout(fail, 5_000);
    const cleanup = () => {
      clearTimeout(timeout);
      host.off("message", onMessage);
      host.off("disconnect", fail);
    };

    host.on("message", onMessage);
    host.on("disconnect", fail);
    try {
      send.call(
        host,
        action === "import-release-data"
          ? DEVELOPMENT_RESTART.importRequest
          : DEVELOPMENT_RESTART.request,
        (error: Error | null) => {
          if (error) fail();
        },
      );
    } catch {
      fail();
    }
  });

  return true;
}
