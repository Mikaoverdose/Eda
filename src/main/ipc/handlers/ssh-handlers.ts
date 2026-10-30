import { t } from "@shared/i18n";
import { BrowserWindow, dialog } from "electron";
import { GitError, ok } from "@shared/errors";
import { IPC_CHANNELS } from "@shared/ipc";
import type { Services } from "../../services";
import { handle } from "../transport";
import { showOpenDialog } from "../dialogs";
import { optionalRecord, requireAbsolutePath, requireId, requireString } from "../validate";
import { invalidRequest } from "../request-errors";

export function registerSshHandlers(services: Services): void {
  handle(IPC_CHANNELS.sshPendingHostTrust, async (event) => {
    if (event.senderFrame !== event.sender.mainFrame)
      throw invalidRequest(t("main.sshHandlers.sshHostTrustRequiresTheApplicationWindow"));
    return ok(services.sshHostTrust.current(event.sender.id));
  });

  handle(IPC_CHANNELS.sshRespondHostTrust, async (event, rawId, rawTrust) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof rawTrust !== "boolean")
      throw invalidRequest(t("main.sshHandlers.invalidSshHostTrustResponse"));
    if (!services.sshHostTrust.respond(event.sender.id, requireId(rawId), rawTrust))
      throw invalidRequest(
        t("main.sshHandlers.thisSshHostTrustRequestHasExpiredOrBelongsToAnotherWindow"),
      );
    return ok(undefined);
  });

  handle(IPC_CHANNELS.sshListKeys, async () => ok(await services.ssh.discoverKeys()));

  handle(IPC_CHANNELS.sshImportKey, async (_e, rawPath) =>
    ok(await services.ssh.importKey(requireAbsolutePath(rawPath, t("fields.keyPath")))),
  );

  handle(IPC_CHANNELS.sshGenerateKey, async (_e, raw) => {
    const input = optionalRecord(raw);
    const type = input["type"] === "rsa" ? "rsa" : "ed25519";
    const bits = typeof input["bits"] === "number" ? input["bits"] : undefined;

    return ok(
      await services.ssh.generateKey({
        path: requireAbsolutePath(input["path"], t("fields.keyPath")),
        type,
        comment: requireString(input["comment"], t("fields.comment"), 256),
        ...(bits !== undefined && { bits }),
      }),
    );
  });

  handle(IPC_CHANNELS.sshGetAgentStatus, async () => ok(await services.ssh.getAgentStatus()));

  handle(IPC_CHANNELS.sshUnlockKey, async (_e, rawRequest, rawPassphrase) => {
    const request = optionalRecord(rawRequest);
    const lifetime = request["lifetimeSeconds"];

    if (typeof rawPassphrase !== "string" || rawPassphrase.length === 0) {
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.unlockSshKey"),
        message: t("main.sshHandlers.enterTheKeySPassphrase"),
        suggestedAction: t("main.sshHandlers.thePassphraseIsTheOneYouSetWhenTheKeyWasCreated"),
      });
    }

    const status = await services.ssh.unlockKey(
      {
        keyPath: requireAbsolutePath(request["keyPath"], t("fields.keyPath")),
        ...(typeof lifetime === "number" &&
          lifetime > 0 && { lifetimeSeconds: Math.floor(lifetime) }),
      },
      rawPassphrase,
    );

    return ok(status);
  });

  handle(IPC_CHANNELS.sshLockKey, async (_e, rawPath) =>
    ok(await services.ssh.lockKey(requireAbsolutePath(rawPath, t("fields.keyPath")))),
  );

  handle(IPC_CHANNELS.sshTestConnection, async (_e, rawHost, rawPath) =>
    ok(
      await services.ssh.testConnection(
        requireString(rawHost, t("fields.host"), 253),
        requireAbsolutePath(rawPath, t("fields.keyPath")),
      ),
    ),
  );

  handle(IPC_CHANNELS.sshChoosePrivateKey, async (event) => {
    const result = await showOpenDialog(event, {
      title: t("main.sshHandlers.chooseAnSshPrivateKey"),
      properties: ["openFile"],
      filters: [{ name: t("main.fileFilters.sshPrivateKeys"), extensions: ["pem", "key", "*"] }],
    });
    return ok(result.canceled ? null : (result.filePaths[0] ?? null));
  });

  handle(IPC_CHANNELS.sshChoosePublicKey, async (event) => {
    const result = await showOpenDialog(event, {
      title: t("main.sshHandlers.chooseAnSshPublicKey"),
      properties: ["openFile"],
      filters: [{ name: t("main.fileFilters.sshPublicKeys"), extensions: ["pub"] }],
    });
    return ok(result.canceled ? null : (result.filePaths[0] ?? null));
  });

  handle(IPC_CHANNELS.sshChooseKeyDestination, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = { title: t("main.sshHandlers.createSshKey"), defaultPath: "id_ed25519" };
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    return ok(result.canceled ? null : (result.filePath ?? null));
  });
}
