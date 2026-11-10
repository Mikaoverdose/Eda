import { errorText } from "@shared/error-codes";
import { shell } from "electron";
import { ok } from "@shared/errors";
import { t } from "@shared/i18n";
import { IPC_CHANNELS } from "@shared/ipc";
import type { Services } from "../../services";
import { handle } from "../transport";
import { captureProfile } from "../profile-context";
import { optionalInteger, requireId, requireString } from "../validate";
import { invalidRequest, missingIdentity } from "../request-errors";

export function registerGitLabSelfHostedHandlers(services: Services): void {
  const { identity, identities, gitlabSelfHosted: gitlab } = services;

  const work = async <T>(profile: unknown, action: (id: string) => Promise<T> | T) => {
    const captured = captureProfile(identity, requireId(profile));

    return identity.serialize(async () => {
      if (!identities.findById(captured.id)) throw missingIdentity(t("operations.gitLabSignIn"));

      return ok(await action(captured.id));
    });
  };

  const instance = (value: unknown) => requireString(value, t("fields.gitLabInstanceUrl"), 2048);

  handle(IPC_CHANNELS.gitlabSelfHostedStatus, async (_event, profile) =>
    work(profile, (id) => gitlab.status(id)),
  );

  handle(
    IPC_CHANNELS.gitlabSelfHostedConnect,
    async (_event, profile, url, token, rawIgnoreTlsErrors) => {
      const baseUrl = instance(url);
      const value = requireString(token, t("fields.personalAccessToken"), 4096);
      if (rawIgnoreTlsErrors !== undefined && typeof rawIgnoreTlsErrors !== "boolean")
        throw invalidRequest(errorText("main.providers.gitlabSelfHosted.invalidUrl"));

      return work(profile, (id) => gitlab.connect(id, baseUrl, value, rawIgnoreTlsErrors ?? false));
    },
  );

  handle(IPC_CHANNELS.gitlabSelfHostedCancel, async (_event, profile) => {
    const captured = captureProfile(identity, requireId(profile));

    gitlab.cancel(captured.id);

    return ok(undefined);
  });

  handle(IPC_CHANNELS.gitlabSelfHostedDisconnect, async (_event, profile, url) => {
    const baseUrl = instance(url);

    return work(profile, (id) => gitlab.disconnect(id, baseUrl));
  });

  handle(IPC_CHANNELS.gitlabSelfHostedOpenTokenSettings, async (_event, profile, url, rawForm) => {
    const baseUrl = instance(url);
    const form = rawForm === undefined ? "legacy" : rawForm;

    if (form !== "legacy" && form !== "granular" && form !== "older")
      throw invalidRequest(errorText("main.providers.gitlabSelfHosted.invalidUrl"));

    return work(profile, async () => {
      await shell.openExternal(gitlab.tokenSettingsUrl(baseUrl, form));
    });
  });

  handle(IPC_CHANNELS.gitlabSelfHostedOpenProfile, async (_event, profile, url) => {
    const baseUrl = instance(url);

    return work(profile, async (id) => {
      await shell.openExternal(gitlab.profileUrl(id, baseUrl));
    });
  });

  handle(IPC_CHANNELS.gitlabSelfHostedRepositories, async (_event, profile, url, rawPage) => {
    const baseUrl = instance(url);
    const page = optionalInteger(rawPage, t("fields.repositoryPage"), 1, 10000) ?? 1;

    return work(profile, (id) => gitlab.repositories(id, baseUrl, page));
  });
}
