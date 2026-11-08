import { t } from "@shared/i18n";
import { shell } from "electron";
import { ok } from "@shared/errors";
import { IPC_CHANNELS } from "@shared/ipc";
import type { Services } from "../../services";
import { handle } from "../transport";
import { captureProfile } from "../profile-context";
import { requireId } from "../validate";
import { missingIdentity } from "../request-errors";

export function registerGitLabHandlers(services: Services): void {
  const { identity, identities, gitlab } = services;
  const work = async <T>(rawProfile: unknown, action: (id: string) => Promise<T> | T) => {
    const captured = captureProfile(identity, requireId(rawProfile));
    return identity.serialize(async () => {
      if (!identities.findById(captured.id))
        throw missingIdentity(t("main.gitlabHandlers.gitLabSignIn"));
      return ok(await action(captured.id));
    });
  };
  handle(IPC_CHANNELS.gitlabProfile, async (_event, profile) =>
    work(profile, async (id) => {
      const details = await gitlab.profile(id);
      if (!details) return null;
      const image = await services.avatars.getGitLab(details.id, details.avatarUrl);
      return { id: details.id, avatarDataUrl: image.dataUrl };
    }),
  );
  handle(IPC_CHANNELS.gitlabStatus, async (_event, profile) =>
    work(profile, (id) => gitlab.status(id)),
  );
  handle(IPC_CHANNELS.gitlabBegin, async (_event, profile) =>
    work(profile, (id) => gitlab.begin(id)),
  );
  handle(IPC_CHANNELS.gitlabPoll, async (_event, profile, rawId) => {
    const id = requireId(rawId);
    return work(profile, (owner) => gitlab.poll(owner, id));
  });
  handle(IPC_CHANNELS.gitlabCancel, async (_event, profile, rawId) => {
    const id = requireId(rawId);
    const captured = captureProfile(identity, requireId(profile));
    gitlab.cancel(captured.id, id);
    return ok(undefined);
  });
  handle(IPC_CHANNELS.gitlabDisconnect, async (_event, profile) =>
    work(profile, (id) => gitlab.disconnect(id)),
  );
  handle(IPC_CHANNELS.gitlabOpenAuthorization, async (_event, profile, rawId) => {
    const id = requireId(rawId);
    return work(profile, async (owner) => {
      await shell.openExternal(gitlab.authorizationUrl(owner, id));
    });
  });
  handle(IPC_CHANNELS.gitlabOpenProfile, async (_event, profile) =>
    work(profile, async (id) => {
      await shell.openExternal(gitlab.profileUrl(id));
    }),
  );
}
