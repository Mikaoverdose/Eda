import { ERROR_CODE, ERROR_MESSAGE_KEYS, errorText } from "@shared/error-codes";
import { AppError, GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import type {
  EffectiveIdentityCheck,
  Identity,
  IdentityDraft,
  IdentitySwitchReport,
  IdentitySwitchStep,
} from "@shared/identity/identity";
import { isCommitIdentity, profileGitConfig } from "@shared/identity/identity";
import { existsSync } from "node:fs";
import type { GitService } from "../git/git-service";
import type { IdentityRepository } from "../persistence/identity-repository";
import type { SettingsRepository } from "../persistence/settings-repository";

export interface OperationIdentity {
  identityId: string;
  identityName: string;
  sshKeyPath?: string;
  gitName: string;
  gitEmail: string;
  signing: Identity["signing"];
  gitExecutable: string;
  gitVersion: string;
}

export class IdentityManager {
  private queue: Promise<unknown> = Promise.resolve();

  private listeners = new Set<(identity: Identity | null) => void>();

  constructor(
    private readonly identities: IdentityRepository,
    private readonly git: GitService,
    private readonly preferences?: Pick<SettingsRepository, "resolve">,
  ) {}

  onChange(listener: (identity: Identity | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyReset(): void {
    this.emit(null);
  }

  getActive(): Identity | null {
    const id = this.identities.getActiveId();
    return id ? (this.identities.findById(id) ?? null) : null;
  }

  serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  async setActive(id: string): Promise<IdentitySwitchReport> {
    return this.serialize(async () => this.activate(this.requireIdentity(id)));
  }

  reapplyGlobal(id: string): Promise<void> {
    return this.serialize(async () => {
      if (this.getActive()?.id !== id)
        throw new GitError({
          kind: "invalid-input",
          operation: t("operations.applyGlobalGitSettings"),
          message: errorText(
            "main.identity.identityManager.theActiveProfileChangedReviewItsGitSettingsBeforeApplyingThem",
          ),
        });
      if (!(this.preferences?.resolve("syncGlobalGitConfig", { profileId: id }).value ?? true))
        throw new GitError({
          kind: "invalid-input",
          operation: t("operations.applyGlobalGitSettings"),
          message: errorText(
            "main.identity.identityManager.globalGitSynchronizationIsDisabledForThisProfile",
          ),
        });
      await this.activate(this.requireIdentity(id));
    });
  }

  forRepository(repositoryId: string, profile: Identity): Identity {
    const override = this.preferences?.resolve("repositoryCommitIdentity", {
      profileId: profile.id,
      repositoryId,
    }).value;
    const identity = override
      ? { ...profile, gitName: override.name, gitEmail: override.email }
      : profile;
    this.assertOperationIdentity(identity);
    return { ...identity, signing: { ...identity.signing } };
  }

  assertOperationIdentity(identity: Identity): void {
    if (!isCommitIdentity({ name: identity.gitName, email: identity.gitEmail }))
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.commitIdentity"),
        message: errorText("main.identity.identityManager.theSavedCommitIdentityIsInvalid"),
        suggestedAction: errorText(
          "main.identity.identityManager.setAValidAuthorNameAndEmailInProfileOrRepositorySettings",
        ),
      });
  }

  replaceAfterDelete(
    id: string,
    fallbackId: string | null,
    cleanup: () => Promise<void>,
  ): Promise<void> {
    return this.serialize(async () => {
      this.requireIdentity(id);

      if (this.getActive()?.id !== id) {
        await cleanup();
        return;
      }

      if (fallbackId) {
        const fallback = this.requireIdentity(fallbackId);
        await this.activate(fallback, async () => {
          await cleanup();
          return fallback;
        });
      } else {
        await cleanup();
        this.identities.setActiveId(null);
        this.emit(null);
      }
    });
  }

  async update(id: string, draft: Partial<IdentityDraft>): Promise<Identity> {
    return this.serialize(async () => {
      const previous = this.requireIdentity(id);
      const proposed = {
        ...previous,
        ...draft,
        signing: { ...previous.signing, ...draft.signing },
      };

      if (
        this.identities
          .list()
          .some(
            (item) =>
              item.id !== id && item.name.toLocaleLowerCase() === proposed.name.toLocaleLowerCase(),
          )
      ) {
        throw new GitError({
          kind: "invalid-input",
          operation: t("operations.saveProfile"),
          message: errorText("main.identity.identityManager.aProfileWithThatNameAlreadyExists"),
        });
      }

      if (this.getActive()?.id !== id) return this.identities.update(id, draft)!;

      const report = await this.activate(proposed, () => this.identities.update(id, draft)!);

      return report.identity;
    });
  }

  private requireIdentity(id: string): Identity {
    const identity = this.identities.findById(id);

    if (!identity)
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.profile"),
        message: errorText("main.identity.identityManager.thatProfileNoLongerExists"),
        suggestedAction: errorText("main.identity.identityManager.refreshProfilesAndTryAgain"),
      });

    return identity;
  }

  private async activate(
    candidate: Identity,
    persist?: () => Identity | Promise<Identity>,
  ): Promise<IdentitySwitchReport> {
    const enabled =
      this.preferences?.resolve("syncGlobalGitConfig", { profileId: candidate.id }).value ?? true;
    const steps: IdentitySwitchStep[] = [];
    const writes: { key: string; previous: string | undefined; written: string | undefined }[] = [];
    let identity = candidate;

    try {
      this.assertOperationIdentity(candidate);
      if (enabled) {
        const expected = profileGitConfig(candidate);

        for (const [key, value] of Object.entries(expected)) {
          const previous = await this.git.readConfig(key, { scope: "global" });
          if (previous === value) continue;
          // Record this before writing: Git can change the config even if the write fails.
          writes.push({ key, previous, written: value });
          if (value === undefined) await this.git.unsetConfig(key, { scope: "global" });
          else await this.git.writeConfig(key, value, { scope: "global" });
        }

        for (const [key, value] of Object.entries(expected)) {
          if ((await this.git.readConfig(key, { scope: "global" })) !== value) {
            throw new GitError({
              kind: "config-write-refused",
              operation: t("operations.switchProfile"),
              message: errorText("main.identity.identityManager.gitDidNotRecordCorrectly", {
                key: key,
              }),
              suggestedAction: errorText(
                "main.identity.identityManager.checkWhetherYourGlobalGitConfigurationIsWritable",
              ),
            });
          }
        }
      }

      for (const name of [
        "write-global-config",
        "verify-read-back",
        "write-signing-config",
      ] as const) {
        steps.push({ name, status: enabled ? "ok" : "skipped" });
      }

      steps.push({
        name: "activate-ssh-key",
        status: candidate.sshKeyPath
          ? existsSync(candidate.sshKeyPath)
            ? "ok"
            : "failed"
          : "skipped",
        ...(candidate.sshKeyPath
          ? {
              detail: existsSync(candidate.sshKeyPath)
                ? candidate.sshKeyPath
                : t(
                    "main.identity.identityManager.theAssignedSshKeyIsMissingRestoreItBeforeRemoteOperations",
                  ),
            }
          : {}),
      });
      identity = persist ? await persist() : candidate;
      this.identities.setActiveId(identity.id);
    } catch (error) {
      const incomplete: string[] = [];

      for (const write of writes.reverse()) {
        try {
          const current = await this.git.readConfig(write.key, { scope: "global" });

          if (current === write.previous) continue;

          if (current !== write.written) {
            incomplete.push(write.key);
            continue;
          }

          if (write.previous === undefined)
            await this.git.unsetConfig(write.key, { scope: "global" });
          else await this.git.writeConfig(write.key, write.previous, { scope: "global" });
        } catch {
          incomplete.push(write.key);
        }
      }

      if (incomplete.length > 0) {
        throw new GitError({
          kind: "config-write-refused",
          operation: t("operations.switchProfile"),
          message: errorText(
            "main.identity.identityManager.theProfileWasNotSwitchedSomeGlobalGitValuesCouldNotBeRestored",
          ),
          suggestedAction: errorText(
            "main.identity.identityManager.inspectInYourGlobalGitConfigurationExternalEditsWerePreserved",
            { incomplete: incomplete.join(", ") },
          ),
        });
      }

      throw error;
    }

    this.emit(identity);

    return { identity, steps, verified: steps.every((step) => step.status !== "failed") };
  }

  captureForOperation(): Promise<OperationIdentity | undefined> {
    const identity = this.getActive();

    if (!identity) return Promise.resolve(undefined);

    const captured: OperationIdentity = {
      identityId: identity.id,
      identityName: identity.name,
      gitName: identity.gitName,
      gitEmail: identity.gitEmail,
      signing: { ...identity.signing },
      gitExecutable: this.git.gitPath,
      gitVersion: this.git.gitVersion,
      ...(identity.sshKeyPath !== undefined && { sshKeyPath: identity.sshKeyPath }),
    };

    return this.serialize(async () => {
      this.requireIdentity(captured.identityId);
      return captured;
    });
  }

  async verifyEffectiveIdentity(
    repositoryPath: string,
    expected: Identity,
  ): Promise<EffectiveIdentityCheck> {
    const [name, email] = await Promise.all([
      this.git.readConfig("user.name", { cwd: repositoryPath }),
      this.git.readConfig("user.email", { cwd: repositoryPath }),
    ]);

    return {
      matches: name === expected.gitName && email === expected.gitEmail,
      expected: { name: expected.gitName, email: expected.gitEmail },
      actual: { ...(name !== undefined && { name }), ...(email !== undefined && { email }) },
    };
  }

  async applyToRepository(repositoryPath: string, identity: Identity): Promise<void> {
    const options = { scope: "local" as const, cwd: repositoryPath };
    const expected = {
      "user.name": identity.gitName,
      "user.email": identity.gitEmail,
      ...this.expectedSigningConfig(identity),
    };
    const writes: { key: string; previous: string | undefined; written: string | undefined }[] = [];

    try {
      for (const [key, written] of Object.entries(expected)) {
        const previous = await this.git.readConfig(key, options);
        if (previous === written) continue;
        writes.push({ key, previous, written });
        if (written === undefined) await this.git.unsetConfig(key, options);
        else await this.git.writeConfig(key, written, options);
      }

      for (const [key, value] of Object.entries(expected))
        if ((await this.git.readConfig(key, options)) !== value)
          throw new AppError(
            errorText(ERROR_MESSAGE_KEYS[ERROR_CODE.IDENTITY_NOT_RECORDED], { key: key }),
          );
    } catch (error) {
      const incomplete: string[] = [];

      for (const { key, previous, written } of writes.reverse()) {
        try {
          const current = await this.git.readConfig(key, options);

          if (current === previous) continue;

          if (current !== written) {
            incomplete.push(key);
            continue;
          }

          if (previous === undefined) await this.git.unsetConfig(key, options);
          else await this.git.writeConfig(key, previous, options);
        } catch {
          incomplete.push(key);
        }
      }

      if (incomplete.length)
        throw new GitError({
          kind: "config-write-refused",
          operation: t("operations.applyProfile"),
          message: errorText(
            "main.identity.identityManager.someLocalGitValuesCouldNotBeRestoredExternalEditsWerePreserved",
            { incomplete: incomplete.join(", ") },
          ),
          repositoryPath,
        });

      throw error;
    }
  }

  private expectedSigningConfig(identity: Identity): Record<string, string | undefined> {
    if (identity.signing.format === "none" || !identity.signing.keyRef) {
      return { "gpg.format": undefined, "user.signingkey": undefined, "commit.gpgsign": "false" };
    }

    return {
      "gpg.format": identity.signing.format === "gpg" ? "openpgp" : "ssh",
      "user.signingkey": identity.signing.keyRef,
      "commit.gpgsign": identity.signing.signCommits ? "true" : "false",
    };
  }

  private emit(identity: Identity | null): void {
    for (const listener of this.listeners) listener(identity);
  }
}
