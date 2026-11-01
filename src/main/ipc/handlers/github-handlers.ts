import { t } from "@shared/i18n";
import { clipboard, shell } from "electron";
import { ok } from "@shared/errors";
import { IPC_CHANNELS, IPC_EVENTS } from "@shared/ipc";
import type { Services } from "../../services";
import { GITHUB_VERIFICATION_URL } from "../../providers/github-auth";
import { handle, broadcast } from "../transport";
import { captureProfile } from "../profile-context";
import { requireId } from "../validate";
import { missingIdentity } from "../request-errors";

export function registerGitHubHandlers(services: Services): void {
  const { identity, identities, github } = services;

  handle(IPC_CHANNELS.githubMaintainerProfile, async () => {
    const details = await github.maintainerProfile();

    if (!details) return ok(null);

    const avatar = await services.avatars.getGitHub(details.id);

    return ok({ ...details, avatarDataUrl: avatar.dataUrl });
  });

  github.onInstallationChanged((profileId) => {
    if (identity.getActive()?.id === profileId)
      broadcast(IPC_EVENTS.githubInstallationChanged, profileId);
  });
  const work = async <T>(rawProfile: unknown, action: (id: string) => Promise<T> | T) => {
    const captured = captureProfile(identity, requireId(rawProfile));
    return identity.serialize(async () => {
      if (!identities.findById(captured.id))
        throw missingIdentity(t("main.githubHandlers.gitHubSignIn"));
      return ok(await action(captured.id));
    });
  };
  handle(IPC_CHANNELS.githubStatus, async (_event, profile) =>
    work(profile, (id) => github.status(id)),
  );
  handle(IPC_CHANNELS.githubRepositoryAccess, async (_event, profile) =>
    work(profile, (id) => github.repositoryAccess(id)),
  );
  handle(IPC_CHANNELS.githubProfile, async (_event, profile) =>
    work(profile, async (id) => {
      const details = await github.profile(id);
      if (!details) return null;
      const avatar = await services.avatars.getGitHub(details.id);
      return { ...details, avatarDataUrl: avatar.dataUrl };
    }),
  );
  handle(IPC_CHANNELS.githubOpenProfile, async (_event, profile) =>
    work(profile, async (id) => {
      await shell.openExternal(github.profileUrl(id));
    }),
  );
  handle(IPC_CHANNELS.githubBegin, async (_event, profile) =>
    work(profile, (id) => github.begin(id)),
  );
  handle(IPC_CHANNELS.githubPoll, async (_event, profile, rawId) => {
    const id = requireId(rawId);
    return work(profile, (owner) => github.poll(owner, id));
  });
  handle(IPC_CHANNELS.githubCancel, async (_event, profile, rawId) => {
    const id = requireId(rawId);
    const captured = captureProfile(identity, requireId(profile));
    github.cancel(captured.id, id);
    return ok(undefined);
  });
  handle(IPC_CHANNELS.githubDisconnect, async (_event, profile) =>
    work(profile, (id) => github.disconnect(id)),
  );
  handle(IPC_CHANNELS.githubOpenInstallations, async (_event, profile) =>
    work(profile, async (id) => {
      await shell.openExternal(await github.startInstallation(id));
    }),
  );
  handle(IPC_CHANNELS.githubOpenVerification, async (_event, profile, rawId) => {
    const id = requireId(rawId);
    return work(profile, async (owner) => {
      const userCode = github.verifyPending(owner, id);
      clipboard.writeText(userCode);
      await shell.openExternal(GITHUB_VERIFICATION_URL);
    });
  });
}
