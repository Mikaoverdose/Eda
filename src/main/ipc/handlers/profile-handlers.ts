import { errorText } from "@shared/error-codes";
import { GitError, ok } from "@shared/errors";
import { t } from "@shared/i18n";
import { commitConfigKeys } from "@shared/identity/profile-session";
import { IPC_CHANNELS, IPC_EVENTS } from "@shared/ipc";
import type { Services } from "../../services";
import { parseDraft, parsePartialDraft } from "../identity-draft";
import { captureProfile } from "../profile-context";
import { invalidRequest, missingIdentity } from "../request-errors";
import { broadcast, handle } from "../transport";
import {
  optionalRecord,
  optionalString,
  requireAbsolutePath,
  requireId,
  requireRecord,
  requireString,
} from "../validate";

export function registerProfileHandlers(services: Services): void {
  const { git, identities, identity, repositories } = services;

  handle(IPC_CHANNELS.identityListGpgSigningKeys, async () =>
    ok(await services.gpg.listSigningKeys()),
  );

  identity.onChange((changed) => broadcast(IPC_EVENTS.identityChanged, changed));

  handle(IPC_CHANNELS.identityList, async () => ok(identities.list()));

  handle(IPC_CHANNELS.identityGetActive, async () => ok(identity.getActive()));

  handle(IPC_CHANNELS.identityReapplyGlobal, async (_event, rawId) => {
    await identity.reapplyGlobal(requireId(rawId));
    return ok(undefined);
  });

  handle(IPC_CHANNELS.identityInspectGit, async (_event, rawId) => {
    const active = identity.getActive();

    if (!active) throw missingIdentity(t("operations.inspectGitConfiguration"));

    const path =
      rawId === undefined ? undefined : repositories.resolveActiveRepository(requireId(rawId)).path;
    const keys = commitConfigKeys("all");
    const [global, repository, local] = await Promise.all([
      Promise.all(keys.map((key) => git.inspectConfig(key, { scope: "global" }))),
      path ? Promise.all(keys.map((key) => git.inspectConfig(key, { cwd: path }))) : null,
      path
        ? git.exec(["config", "--local", "--no-includes", "--null", "--name-only", "--list"], {
            cwd: path,
            operation: t("operations.inspectLocalCommitOverrides"),
          })
        : null,
    ]);

    const localOverrides = local
      ? local.stdout.split("\0").filter((key) => keys.includes(key))
      : null;

    return ok({ profileId: active.id, global, repository, localOverrides });
  });

  handle(IPC_CHANNELS.identityCreate, async (_e, raw, rawOptions) => {
    const draft = parseDraft(raw);
    const options =
      rawOptions === undefined
        ? {}
        : requireRecord(rawOptions, t("main.profileHandlers.creationOptions"));
    const sync = options["syncGlobalGitConfig"];

    if (sync !== undefined && typeof sync !== "boolean")
      throw invalidRequest(errorText("main.profileHandlers.invalidGitSynchronizationPreference"));

    return ok(
      await identity.serialize(async () =>
        identities.create(draft, sync === undefined ? {} : { syncGlobalGitConfig: sync }),
      ),
    );
  });

  handle(IPC_CHANNELS.identityUpdate, async (_e, rawId, raw) => {
    const id = requireId(rawId);
    const updated = await identity.update(id, parsePartialDraft(raw));
    if (!updated) throw missingIdentity(t("operations.updateIdentity"));
    return ok(updated);
  });

  handle(IPC_CHANNELS.identityPreviewDelete, async (_e, rawId) =>
    ok(services.profiles.previewDelete(requireId(rawId))),
  );

  handle(IPC_CHANNELS.identityDuplicate, async (_e, rawId, rawOptions) => {
    const input = requireRecord(rawOptions, t("main.profileHandlers.duplicateOptions"));

    for (const key of ["preferences", "repositories", "tabs"])
      if (typeof input[key] !== "boolean")
        throw invalidRequest(errorText("main.profileHandlers.invalidDuplicateOptions"));

    return ok(
      await services.profiles.duplicate(requireId(rawId), {
        name: requireString(input["name"], t("fields.profileName"), 100),
        preferences: input["preferences"] === true,
        repositories: input["repositories"] === true,
        tabs: input["tabs"] === true,
      }),
    );
  });

  handle(IPC_CHANNELS.identityDelete, async (event, rawId, rawToken) => {
    const id = requireId(rawId);
    await services.sessions.transition(event.sender.id, () =>
      services.profiles.delete(id, requireString(rawToken, t("fields.deletionPreview"), 128)),
    );
    broadcast(IPC_EVENTS.repositoriesChanged);
    return ok(undefined);
  });

  handle(IPC_CHANNELS.identitySetActive, async (event, rawId) => {
    const id = requireId(rawId);
    const prepared = services.sessionStore.read(id, "primary");
    const report = await services.sessions.transition(event.sender.id, () =>
      identity.setActive(id),
    );

    broadcast(IPC_EVENTS.repositoriesChanged);

    return ok({
      ...report,
      session: services.sessions.bindPrepared(event.sender.id, id, prepared),
    });
  });

  handle(IPC_CHANNELS.identityAssignSshKey, async (_e, rawPath, rawProfile) => {
    const active = captureProfile(identity, rawProfile);
    const path = rawPath === null ? null : requireAbsolutePath(rawPath, t("fields.keyPath"));
    const updated = await identity.serialize(async () =>
      identities.findById(active.id) ? identities.assignSshKey(active.id, path) : undefined,
    );

    if (!updated) throw missingIdentity(t("operations.assignSshKey"));

    broadcast(IPC_EVENTS.identityChanged, updated);

    return ok(updated);
  });

  handle(IPC_CHANNELS.identityConfigureSigning, async (_e, raw, rawProfile) => {
    const active = captureProfile(identity, rawProfile);
    const input = optionalRecord(raw);
    const format =
      input["format"] === "ssh" || input["format"] === "gpg" ? input["format"] : "none";
    const keyRef = optionalString(input["keyRef"], t("fields.signingKey"), 1024);

    if (format !== "none" && keyRef === undefined) {
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.configureSigning"),
        message: errorText("main.profileHandlers.chooseASigningKey"),
        suggestedAction:
          format === "ssh"
            ? errorText("main.profileHandlers.chooseThePublicPubKeyFile")
            : errorText("main.profileHandlers.selectAnAvailableGpgSigningKey"),
      });
    }

    const updated = await identity.update(active.id, {
      signing: {
        format,
        ...(keyRef !== undefined && { keyRef }),
        signCommits: input["signCommits"] === true,
      },
    });

    if (!updated) throw missingIdentity(t("operations.configureSigning"));

    return ok(updated);
  });
}
