import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import type { BackgroundFetchState, FetchHistory } from "@shared/integrations/background-fetch";
import type { IdentityManager } from "../../identity/identity-manager";
import type { ProfileSessionRepository } from "../../persistence/profile-session-repository";
import type { SettingsRepository } from "../../persistence/settings-repository";
import type { RepositoryManager } from "../lifecycle/repository-manager";
import type { RemoteService } from "./remote-service";

export interface FetchConditions {
  online: boolean;
  suspended: boolean;
}

export class BackgroundFetchService {
  private timer: ReturnType<typeof setInterval> | undefined;
  private pending: Promise<void> | null = null;
  private fetchingProfile: string | null = null;
  private stopping = false;
  private fetchingRepository: string | null = null;

  constructor(
    private readonly identity: IdentityManager,
    private readonly sessions: ProfileSessionRepository,
    private readonly settings: SettingsRepository,
    private readonly repositories: RepositoryManager,
    private readonly remotes: RemoteService,
    private readonly conditions: () => FetchConditions,
    private readonly changed: (repositoryId: string) => void,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    if (this.timer) return;
    this.stopping = false;
    this.timer = setInterval(() => {
      void this.tick();
    }, 15_000);
    this.timer.unref();
  }

  stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.fetchingProfile && this.fetchingRepository)
      this.remotes.cancelScheduled(this.fetchingProfile, this.fetchingRepository);
    return this.pending ?? Promise.resolve();
  }

  private due(history: FetchHistory | null, minutes: number): number | null {
    if (!minutes) return null;
    return (
      history?.retryAt ??
      (history?.lastSuccess ? history.lastSuccess + minutes * 60_000 : this.now())
    );
  }

  async inspect(repositoryId: string): Promise<BackgroundFetchState> {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    const intervalMinutes = this.settings.resolve("backgroundFetchMinutes", {
      profileId: repository.identityId,
      repositoryId,
    }).value;

    return {
      intervalMinutes,
      ...this.conditions(),
      fetching: this.fetchingRepository === repositoryId,
      remotes: (await this.remotes.fetchStates(repositoryId)).map((remote) => ({
        ...remote,
        nextFetch: remote.supported ? this.due(remote.history, intervalMinutes) : null,
      })),
    };
  }

  configure(repositoryId: string, minutes: number | null): void {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    const scope = { kind: "repository" as const, profileId: repository.identityId, repositoryId };
    if (minutes === null) this.settings.reset("backgroundFetchMinutes", scope);
    else this.settings.set("backgroundFetchMinutes", scope, minutes);
  }

  async retry(repositoryId: string, remote: string): Promise<void> {
    const state = await this.inspect(repositoryId);

    if (!state.online || state.suspended)
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.retryBackgroundFetch"),
        message: errorText(
          "main.backgroundFetchService.backgroundFetchIsPausedByNetworkConditionsOr",
        ),
      });

    await this.remotes.fetch({ repositoryId, remote, prune: false, tags: false });
    this.changed(repositoryId);
  }

  tick(): Promise<void> {
    if (this.pending) return this.pending;
    if (this.stopping) return Promise.resolve();
    this.pending = this.run().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async run(): Promise<void> {
    try {
      const profile = this.identity.getActive();

      if (!profile) return;

      for (const repositoryId of this.sessions.openRepositoryIds(profile.id)) {
        if (this.stopping || this.identity.getActive()?.id !== profile.id) return;

        try {
          const state = await this.inspect(repositoryId);

          if (!state.intervalMinutes || !state.online || state.suspended) continue;

          for (const remote of state.remotes) {
            if (this.stopping || this.identity.getActive()?.id !== profile.id) return;

            const currentConditions = this.conditions();

            if (!currentConditions.online || currentConditions.suspended) return;

            if (!remote.supported || remote.nextFetch === null || remote.nextFetch > this.now())
              continue;

            this.fetchingRepository = repositoryId;
            this.fetchingProfile = profile.id;

            try {
              await this.remotes.fetch(
                {
                  repositoryId,
                  remote: remote.name,
                  prune: false,
                  tags: false,
                },
                t("main.backgroundFetchService.backgroundFetch"),
                "main.backgroundFetchService.backgroundFetch",
              );
            } catch {
            } finally {
              this.fetchingRepository = null;
              this.fetchingProfile = null;
              this.changed(repositoryId);
            }
          }
        } catch {}
      }
    } finally {
      this.fetchingRepository = null;
      this.fetchingProfile = null;
    }
  }
}
