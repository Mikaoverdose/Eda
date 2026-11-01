import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { setLocale, t } from "@shared/i18n";
import { IPC_EVENTS } from "@shared/ipc";
import { UPDATE_FEED_BASE, type UpdateCapability, type UpdatePlatform } from "@shared/updates";
import { app, net, powerMonitor } from "electron";
import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createVelopackUpdater, type VelopackUpdater } from "./application/velopack-updater";
import { clearDatabase } from "./application/reset-data";
import { SshHostTrustPrompts } from "./application/ssh-host-trust";
import { UpdateService } from "./application/update-service";
import { AvatarCache } from "./avatars/avatar-cache";
import { CredentialService } from "./credentials/credential-service";
import {
  bundledGitBinary,
  bundledGitEnvironment,
  bundledGitLocation,
} from "./git/execution/bundled-git";
import { resolveGitEngine, type GitEngine } from "./git/execution/git-engine";
import { NodeProcessRunner } from "./git/execution/node-process-runner";
import { ExternalMergeTool } from "./git/external-merge-tool";
import { GitService } from "./git/git-service";
import { GpgKeyService } from "./git/security/gpg-keys";
import { SshAgent } from "./git/security/ssh-agent";
import { SshHostTrustRunner } from "./git/security/ssh-host-trust";
import { IdentityManager } from "./identity/identity-manager";
import { ProfileService } from "./identity/profile-service";
import { ProfileSessions } from "./identity/profile-sessions";
import { beginUpdateInstall, broadcast } from "./ipc/transport";
import { OperationManager } from "./operations/operation-manager";
import { ContentRecoveryRepository } from "./persistence/content-recovery-repository";
import { openDatabase } from "./persistence/database";
import { FetchHistoryRepository } from "./persistence/fetch-history-repository";
import { GitHubAccountRepository } from "./persistence/github-account-repository";
import { IdentityRepository } from "./persistence/identity-repository";
import { OperationRepository } from "./persistence/operation-repository";
import { ProfileSessionRepository } from "./persistence/profile-session-repository";
import { SettingsRepository } from "./persistence/settings-repository";
import type { Database } from "./persistence/types";
import { WorkflowJournal } from "./persistence/workflow-journal";
import { GitHubAuth } from "./providers/github-auth";
import { HistoryRecoveryService } from "./repo/history/history-recovery-service";
import { HistoryReversalService } from "./repo/history/history-reversal-service";
import { RepositoryNavigationQueue } from "./repo/lifecycle/navigation";
import { RepositoryManager } from "./repo/lifecycle/repository-manager";
import { BackgroundFetchService } from "./repo/sync/background-fetch-service";
import { PullService } from "./repo/sync/pull-service";
import { RemoteService } from "./repo/sync/remote-service";
import { ConflictService } from "./repo/workflows/conflict-service";
import { RebaseService } from "./repo/workflows/rebase-service";
import { ReplayService } from "./repo/workflows/replay-service";
import { ResetService } from "./repo/workflows/reset-service";
import { StashService } from "./repo/workflows/stash-service";
import { WorkflowService } from "./repo/workflows/workflow-service";
import { RepositoryWriter } from "./repo/working-tree/repository-writer";
import { KeychainSecretStore, vaultPathFor } from "./secrets/keychain-secret-store";
import type { SecretStore } from "./secrets/secret-store";
import { SshService } from "./ssh/ssh-service";

declare const __EDA_GITHUB_CLIENT_ID__: string;
declare const __EDA_GITHUB_APP_SLUG__: string;

export interface Services {
  updates: UpdateService;
  resetData(): Promise<void>;
  github: GitHubAuth;
  avatars: AvatarCache;
  backgroundFetch: BackgroundFetchService;
  pull: PullService;
  rebase: RebaseService;
  replay: ReplayService;
  reset: ResetService;
  historyReversal: HistoryReversalService;
  historyRecovery: HistoryRecoveryService;
  stashes: StashService;
  workflows: WorkflowService;
  conflicts: ConflictService;
  remotes: RemoteService;
  navigation: RepositoryNavigationQueue;
  db: Database;
  git: GitService;
  engine: GitEngine;
  identities: IdentityRepository;
  identity: IdentityManager;
  repositories: RepositoryManager;
  writer: RepositoryWriter;
  secrets: SecretStore;
  ssh: SshService;
  sshHostTrust: SshHostTrustPrompts;
  sshAgent: SshAgent;
  gpg: GpgKeyService;
  credentials: CredentialService;
  preferences: SettingsRepository;
  sessionStore: ProfileSessionRepository;
  sessions: ProfileSessions;
  profiles: ProfileService;
  operations: OperationManager;
}

export async function createServices(): Promise<Services> {
  const runner = new NodeProcessRunner();
  const db = openDatabase(join(app.getPath("userData"), "eda.db"));
  let sshAgent: SshAgent | undefined;

  try {
    const preferences = new SettingsRepository(db);
    const language = preferences.resolve("language").value;
    if (language !== "system") setLocale(language);
    const bundle = bundledGitLocation(
      app.isPackaged,
      resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
      process.resourcesPath,
    );
    const engine = await resolveGitEngine(runner, {
      preferred: preferences.resolve("gitEngine").value,
      bundledPath: bundledGitBinary(bundle),
      bundledEnvironment: bundledGitEnvironment(bundle),
    });
    const operations = new OperationManager(new OperationRepository(db));
    // Git for Windows includes the OpenSSH/MSYS tools we need.
    const sshEnvironment =
      process.platform === "win32" ? { PATH: bundledGitEnvironment(bundle)["PATH"]! } : {};
    sshAgent = new SshAgent(preferences.resolve("sshAgent").value, "ssh-agent", sshEnvironment);
    await sshAgent.start();
    const transportEnvironment = Object.assign(sshAgent.environment, sshEnvironment);
    const sshHostTrust = new SshHostTrustPrompts();
    const transportRunner = new SshHostTrustRunner(runner, sshHostTrust.confirm);
    const git = new GitService(transportRunner, engine, transportEnvironment, operations);

    const identities = new IdentityRepository(db, preferences);
    const identity = new IdentityManager(identities, git, preferences);
    const repositories = new RepositoryManager(db, git, identity, identities);
    const secrets = await KeychainSecretStore.create(vaultPathFor(app.getPath("userData")));
    const ssh = new SshService(transportRunner, undefined, transportEnvironment, sshAgent);
    const credentials = new CredentialService(identities, secrets, ssh);
    const github = new GitHubAuth(
      new GitHubAccountRepository(db),
      secrets,
      __EDA_GITHUB_CLIENT_ID__,
      (url, options) => net.fetch(url instanceof URL ? url.href : url, options),
      Date.now,
      __EDA_GITHUB_APP_SLUG__,
    );
    identity.onChange(() => github.cancelAll());
    const recovery = new ContentRecoveryRepository(db);
    const journal = new WorkflowJournal(db);
    const writer = new RepositoryWriter(
      git,
      repositories,
      identity,
      identities,
      operations,
      recovery,
      journal,
    );

    const sessionStore = new ProfileSessionRepository(db);
    const sessions = new ProfileSessions(identity, sessionStore);
    const profiles = new ProfileService(db, identities, identity, sessionStore, secrets);
    const workflows = new WorkflowService(git, repositories, writer, identity, journal, recovery);

    const rebase = new RebaseService(
      git,
      repositories,
      writer,
      identity,
      workflows,
      journal,
      recovery,
    );

    const remotes = new RemoteService(
      git,
      repositories,
      writer,
      identity,
      identities,
      operations,
      new FetchHistoryRepository(db),
      github,
    );

    let suspended = false;

    powerMonitor.on("suspend", () => {
      suspended = true;
    });
    powerMonitor.on("resume", () => {
      suspended = false;
    });

    const backgroundFetch = new BackgroundFetchService(
      identity,
      sessionStore,
      preferences,
      repositories,
      remotes,
      () => ({ online: net.isOnline(), suspended }),
      (id) => broadcast(IPC_EVENTS.repositoryChanged, id),
    );

    const avatars = new AvatarCache(
      join(app.getPath("userData"), "cache", "avatars"),
      (url, options) => net.fetch(url instanceof URL ? url.href : url, options),
    );

    const platform: UpdatePlatform =
      process.platform === "win32" ? "win" : process.platform === "darwin" ? "osx" : "linux";
    const supportedArch = ["x64", "arm64"].includes(process.arch);
    let capability: UpdateCapability = app.isPackaged ? "manual" : "development";
    let installedUpdater: VelopackUpdater | undefined;
    if (app.isPackaged && supportedArch) {
      try {
        installedUpdater = await createVelopackUpdater(
          `${UPDATE_FEED_BASE}${platform}/${process.arch}/`,
          platform,
          process.arch,
          app.getVersion(),
          () => app.quit(),
        );
        capability = "automatic";
      } catch {
        capability = "manual";
      }
    }
    const updates = new UpdateService({
      capability,
      reason:
        capability === "development"
          ? t("main.services.developmentBuildsAreNeverReplacedUseAnInstalled")
          : capability === "manual"
            ? t("main.services.useTheDownloadPageOrYourPackageManager")
            : null,
      platform,
      arch: process.arch,
      currentVersion: app.getVersion(),
      automaticChecks: () => preferences.resolve("automaticUpdateChecks").value,
      createDriver: () => installedUpdater!,
      prepareInstall: async () => {
        const release = beginUpdateInstall();
        const rollback = () => {
          release();
          backgroundFetch.start();
        };
        try {
          await backgroundFetch.stop();
          if (operations.busy)
            throw new GitError({
              kind: "invalid-input",
              operation: t("operations.installUpdate"),
              message: errorText(
                "main.services.finishRunningGitOperationsBeforeInstallingAnUpdate",
              ),
            });
          await identity.serialize(async () => undefined);
          return rollback;
        } catch (error) {
          rollback();
          throw error;
        }
      },
    });

    return {
      updates,
      github,
      historyReversal: new HistoryReversalService(
        git,
        repositories,
        writer,
        workflows,
        journal,
        recovery,
      ),
      historyRecovery: new HistoryRecoveryService(git, repositories, writer, journal),
      backgroundFetch,
      pull: new PullService(git, repositories, writer, remotes, workflows, rebase, preferences),
      rebase,
      reset: new ResetService(git, repositories, writer, workflows, journal, recovery),
      replay: new ReplayService(git, repositories, writer, identity, workflows, journal, recovery),
      stashes: new StashService(git, repositories, writer, identity, workflows, recovery),
      workflows,
      conflicts: new ConflictService(
        git,
        repositories,
        writer,
        workflows,
        new ExternalMergeTool(runner, operations),
        preferences,
      ),
      remotes,
      avatars,
      async resetData() {
        await updates.discardDownload();
        operations.reset();
        await backgroundFetch.stop();
        try {
          await github.reset();
          await identity.serialize(async () => {
            await avatars.clear();
            await secrets.clear();
            await rm(vaultPathFor(app.getPath("userData")), { force: true });
            await sshAgent!.reset();
            clearDatabase(db);
            sessions.clear();
            identity.notifyReset();
          });
        } finally {
          updates.refreshSchedule();
          backgroundFetch.start();
        }
      },
      navigation: new RepositoryNavigationQueue(),
      db,
      git,
      engine,
      identities,
      identity,
      repositories,
      writer,
      secrets,
      ssh,
      sshHostTrust,
      sshAgent,
      gpg: new GpgKeyService(runner, git, { ...engine.environment, ...transportEnvironment }),
      credentials,
      preferences,
      sessionStore,
      sessions,
      profiles,
      operations,
    };
  } catch (error) {
    await sshAgent?.stop();
    db.close();
    throw error;
  }
}
