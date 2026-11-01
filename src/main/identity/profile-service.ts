import { errorText, type ErrorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import type {
  DuplicateProfileOptions,
  ProfileDeletePreview,
} from "@shared/identity/profile-session";
import { builtInSetting, requireSettingKey, validateSetting } from "@shared/preferences/settings";
import { and, eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import type { IdentityRepository } from "../persistence/identity-repository";
import type { ProfileSessionRepository } from "../persistence/profile-session-repository";
import {
  contentRecovery,
  profileDrafts,
  profileRecovery,
  profileSessions,
  repositories,
  settingOverrides,
} from "../persistence/schema";
import type { Database } from "../persistence/types";
import type { SecretStore } from "../secrets/secret-store";
import type { IdentityManager } from "./identity-manager";

export class ProfileService {
  constructor(
    private readonly db: Database,
    private readonly identities: IdentityRepository,
    private readonly identity: IdentityManager,
    private readonly sessions: ProfileSessionRepository,
    private readonly secrets: SecretStore,
  ) {}

  assignRepository(repositoryId: string, targetProfileId: string, move: boolean): Promise<string> {
    const owner = this.identity.getActive()?.id;

    if (!owner || owner === targetProfileId)
      throw invalid(errorText("main.identity.profileService.chooseADifferentDestinationProfile"));

    return this.identity.serialize(async () =>
      this.db.transaction(() => {
        const source = this.db
          .select()
          .from(repositories)
          .where(and(eq(repositories.id, repositoryId), eq(repositories.identityId, owner)))
          .get();

        if (!source || !this.identities.findById(targetProfileId))
          throw invalid(
            errorText(
              "main.identity.profileService.theSourceRepositoryOrDestinationProfileNoLongerExists",
            ),
          );

        const existing = this.db
          .select()
          .from(repositories)
          .where(
            and(eq(repositories.identityId, targetProfileId), eq(repositories.path, source.path)),
          )
          .get();

        const targetId = existing?.id ?? randomUUID();

        if (!existing)
          this.db
            .insert(repositories)
            .values({ ...source, id: targetId, identityId: targetProfileId })
            .run();

        // Don't move drafts or credentials along with the repository.
        if (move) this.db.delete(repositories).where(eq(repositories.id, source.id)).run();

        return targetId;
      }),
    );
  }

  duplicate(id: string, options: DuplicateProfileOptions) {
    return this.identity.serialize(async () => {
      const source = this.identities.findById(id);

      if (!source)
        throw invalid(errorText("main.identity.profileService.thatProfileNoLongerExists"));
      if (!options.name.trim() || options.name.length > 100)
        throw invalid(
          errorText("main.identity.profileService.enterAProfileNameOf1To100Characters"),
        );
      if (options.tabs && !options.repositories)
        throw invalid(errorText("main.identity.profileService.copyRepositoriesToCopyTheirTabs"));

      return this.db.transaction(() => {
        const copy = this.identities.create({
          name: options.name.trim(),
          gitName: source.gitName,
          gitEmail: source.gitEmail,
          hue: builtInSetting("accentHue").value,
          rules: [...source.rules],
          signing: { format: "none", signCommits: false },
        });

        const remap = new Map<string, string>();

        if (options.repositories)
          for (const row of this.db
            .select()
            .from(repositories)
            .where(eq(repositories.identityId, id))
            .all()) {
            const membershipId = randomUUID();
            remap.set(row.id, membershipId);
            this.db
              .insert(repositories)
              .values({ ...row, id: membershipId, identityId: copy.id })
              .run();
          }

        if (options.preferences)
          for (const row of this.db
            .select()
            .from(settingOverrides)
            .where(eq(settingOverrides.profileId, id))
            .all()) {
            const repositoryId = row.repositoryId ? remap.get(row.repositoryId) : null;

            if (row.repositoryId && !repositoryId) continue;

            try {
              const key = requireSettingKey(row.key);

              validateSetting(
                key,
                repositoryId
                  ? { kind: "repository", profileId: copy.id, repositoryId }
                  : { kind: "profile", profileId: copy.id },
                JSON.parse(row.value),
              );
            } catch {
              continue;
            }

            this.db
              .insert(settingOverrides)
              .values({
                ...row,
                id: randomUUID(),
                profileId: copy.id,
                repositoryId: repositoryId ?? null,
              })
              .run();
          }

        if (options.tabs)
          for (const row of this.db
            .select()
            .from(profileSessions)
            .where(eq(profileSessions.profileId, id))
            .all()) {
            const saved = this.sessions.read(id, row.windowId);

            if (saved.recovery)
              throw invalid(
                errorText(
                  "main.identity.profileService.recoverTheSourceSavedStateBeforeCopyingItsTabs",
                ),
              );

            const tabs = saved.session.tabs.flatMap((old) => remap.get(old) ?? []);
            const selectedRepositoryId = saved.session.selectedRepositoryId
              ? (remap.get(saved.session.selectedRepositoryId) ?? null)
              : null;

            this.sessions.change(copy.id, row.windowId, {
              kind: "tabs",
              tabs,
              selectedRepositoryId,
            });

            for (const [old, view] of Object.entries(saved.session.views)) {
              const repositoryId = remap.get(old);
              if (repositoryId)
                this.sessions.change(copy.id, row.windowId, { kind: "view", repositoryId, view });
            }
          }

        return this.identities.findById(copy.id)!;
      });
    });
  }

  previewDelete(id: string): ProfileDeletePreview {
    const profile = this.identities.findById(id);

    if (!profile)
      throw invalid(errorText("main.identity.profileService.thatProfileNoLongerExists"));

    const active = this.identity.getActive()?.id === id;
    const fallback = active ? this.identities.list().find((item) => item.id !== id) : undefined;
    const rows = this.db.select().from(repositories).where(eq(repositories.identityId, id)).all();
    const drafts = this.db
      .select()
      .from(profileDrafts)
      .where(eq(profileDrafts.profileId, id))
      .all();
    const state = this.db
      .select()
      .from(profileSessions)
      .where(eq(profileSessions.profileId, id))
      .all();
    const overrides = this.db
      .select()
      .from(settingOverrides)
      .where(eq(settingOverrides.profileId, id))
      .all();
    const recovery = this.db
      .select()
      .from(profileRecovery)
      .where(eq(profileRecovery.profileId, id))
      .all();
    const contentSnapshots = this.db
      .select({ id: contentRecovery.id })
      .from(contentRecovery)
      .where(eq(contentRecovery.profileId, id))
      .all();
    const token = createHash("sha256")
      .update(
        JSON.stringify({
          profile,
          rows,
          drafts,
          state,
          overrides,
          recovery,
          contentSnapshots,
          active,
          fallback,
        }),
      )
      .digest("hex");

    return {
      profileId: id,
      name: profile.name,
      active,
      repositories: rows.length,
      drafts: drafts.length,
      fallback: fallback ? { id: fallback.id, name: fallback.name } : null,
      token,
    };
  }

  async delete(id: string, token: string): Promise<void> {
    const preview = this.previewDelete(id);

    if (preview.fallback) this.sessions.read(preview.fallback.id, "primary");

    await this.identity.replaceAfterDelete(id, preview.fallback?.id ?? null, async () => {
      if (this.previewDelete(id).token !== token)
        throw invalid(
          errorText(
            "main.identity.profileService.theProfileChangedAfterThePreviewReviewTheUpdatedDeletionPreview",
          ),
        );

      // Delete credentials first so we can retry if vault cleanup fails.
      await this.secrets.deleteForIdentity(id);

      try {
        this.db.transaction(() => {
          this.identities.delete(id);
          if (preview.active) this.identities.setActiveId(preview.fallback?.id ?? null);
        });
      } catch {
        throw invalid(
          errorText(
            "main.identity.profileService.rememberedCredentialsWereRemovedButProfileMetadataCould",
          ),
        );
      }
    });
  }
}

function invalid(message: ErrorText): GitError {
  return new GitError({ kind: "invalid-input", operation: t("operations.manageProfile"), message });
}
