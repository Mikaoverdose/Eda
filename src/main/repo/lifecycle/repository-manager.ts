import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import type { Identity } from "@shared/identity/identity";
import type { InitRepositoryOptions, RepositorySummary } from "@shared/repository/repository";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { lstat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { GitService } from "../../git/git-service";
import { assertValidRefName } from "../../git/validation";
import type { IdentityManager } from "../../identity/identity-manager";
import { findIdentityForPath } from "../../identity/path-rules";
import type { IdentityRepository } from "../../persistence/identity-repository";
import { repositories, type RepositoryRow } from "../../persistence/schema";
import type { Database } from "../../persistence/types";
import { initFiles } from "./init-files";

export class RepositoryManager {
  constructor(
    private readonly db: Database,
    private readonly git: GitService,
    private readonly identity: IdentityManager,
    private readonly identities: IdentityRepository,
  ) {}

  suggestIdentityForPath(path: string): { id: string; name: string } | undefined {
    const match = findIdentityForPath(path, this.identities.list(), homedir());
    return match ? { id: match.id, name: match.name } : undefined;
  }

  async listForActiveIdentity(): Promise<RepositorySummary[]> {
    const active = this.identity.getActive();

    if (!active) return [];

    const rows = this.db
      .select()
      .from(repositories)
      .where(eq(repositories.identityId, active.id))
      .orderBy(desc(repositories.favourite), sql`${repositories.name} COLLATE NOCASE`)
      .all();

    return Promise.all(
      rows.map(async (row) => ({
        ...toSummary(row),
        available: await this.git.isRepository(row.path),
      })),
    );
  }

  async open(path: string, captured?: Identity): Promise<RepositorySummary> {
    const active = captured ?? this.requireActiveIdentity(t("operations.openRepository"));
    const entry = await lstat(path).catch(() => null);

    if (entry?.isFile()) path = dirname(path);

    if (!(await this.git.isRepository(path))) {
      throw new GitError({
        kind: "not-a-repository",
        operation: t("operations.openRepository"),
        message: errorText("main.repositoryManager.isNotAGitRepository", { path: path }),
        suggestedAction: errorText(
          "main.repositoryManager.chooseAFolderContainingAGitRepositoryOrInitializeOneHere",
        ),
        repositoryPath: path,
      });
    }

    const root = await this.git.resolveRepositoryRoot(path);

    return this.register(root, active);
  }

  async init(
    path: string,
    options: InitRepositoryOptions = {
      branch: "main",
      readme: false,
      ignore: "none",
      license: "none",
    },
  ): Promise<RepositorySummary> {
    const active = this.requireActiveIdentity(t("operations.createRepository"));

    return this.identity.serialize(async () => {
      if (!this.identities.findById(active.id))
        throw new GitError({
          kind: "invalid-input",
          operation: t("operations.createRepository"),
          message: errorText("main.repositoryManager.theOriginatingProfileNoLongerExists"),
        });

      assertValidRefName(options.branch, t("operations.createRepository"));

      if (options.branch === "HEAD")
        throw new GitError({
          kind: "invalid-input",
          operation: t("operations.createRepository"),
          message: errorText("main.repositoryManager.headIsReservedChooseABranchName"),
        });

      if (await this.git.isRepository(path)) {
        throw new GitError({
          kind: "invalid-input",
          operation: t("operations.createRepository"),
          message: errorText("main.repositoryManager.isAlreadyAGitRepository", { path: path }),
          suggestedAction: errorText("main.repositoryManager.openItInsteadOrChooseAnEmptyFolder"),
          repositoryPath: path,
        });
      }

      const files = initFiles(options, basename(path), active.gitName);

      for (const name of Object.keys(files)) {
        const existing = await lstat(join(path, name)).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw error;
        });

        if (existing)
          throw new GitError({
            kind: "invalid-input",
            operation: t("operations.createRepository"),
            message: errorText(
              "main.repositoryManager.alreadyExistsDeselectItToPreserveTheExistingFile",
              {
                name: name,
              },
            ),
          });
      }

      await this.git.exec(["init", "-b", options.branch], {
        cwd: path,
        operation: t("operations.createRepository"),
      });

      for (const [name, content] of Object.entries(files))
        await writeFile(join(path, name), content, { flag: "wx" });

      const root = await this.git.resolveRepositoryRoot(path);

      await this.identity.applyToRepository(root, active);

      return this.register(root, active);
    });
  }

  async relocate(id: string, path: string): Promise<RepositorySummary> {
    const captured = this.resolveActiveRepository(id);

    return this.identity.serialize(async () => {
      const current = this.resolveActiveRepository(id);

      if (current.identityId !== captured.identityId || current.path !== captured.path) {
        throw new GitError({
          kind: "invalid-input",
          operation: t("operations.locateRepository"),
          message: errorText("main.repositoryManager.theRepositoryChangedRefreshAndTryAgain"),
        });
      }

      if (await this.git.isRepository(current.path)) {
        throw new GitError({
          kind: "invalid-input",
          operation: t("operations.locateRepository"),
          message: errorText(
            "main.repositoryManager.theSavedRepositoryIsStillAvailableOpenTheOtherFolderSeparately",
          ),
        });
      }

      if (!(await this.git.isRepository(path))) {
        throw new GitError({
          kind: "not-a-repository",
          operation: t("operations.locateRepository"),
          message: errorText("main.repositoryManager.chooseTheMovedGitRepositorySFolder"),
        });
      }

      const root = await this.git.resolveRepositoryRoot(path);
      const owned = this.db
        .select()
        .from(repositories)
        .where(eq(repositories.identityId, captured.identityId))
        .all();
      const samePath = (left: string, right: string) =>
        process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;

      if (owned.some((row) => row.id !== id && samePath(row.path, root))) {
        throw new GitError({
          kind: "invalid-input",
          operation: t("operations.locateRepository"),
          message: errorText("main.repositoryManager.thisProfileAlreadyListsThatFolderItsSeparate"),
        });
      }

      const row = owned.find((candidate) => candidate.id === id)!;
      const updated = {
        ...row,
        path: root,
        name: row.name === basename(row.path) ? basename(root) : row.name,
      };

      this.db
        .update(repositories)
        .set({ path: updated.path, name: updated.name })
        .where(eq(repositories.id, id))
        .run();

      return { ...toSummary(updated), available: true };
    });
  }

  remove(id: string): void {
    const repository = this.resolveActiveRepository(id);

    this.db
      .delete(repositories)
      .where(
        and(eq(repositories.id, repository.id), eq(repositories.identityId, repository.identityId)),
      )
      .run();
  }

  resolveActiveRepository(id: string): { id: string; identityId: string; path: string } {
    const active = this.requireActiveIdentity(t("operations.accessRepository"));
    const row = this.db
      .select({ id: repositories.id, identityId: repositories.identityId, path: repositories.path })
      .from(repositories)
      .where(and(eq(repositories.id, id), eq(repositories.identityId, active.id)))
      .get();

    if (!row) {
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.accessRepository"),
        message: errorText("main.repositoryManager.thatRepositoryDoesNotBelongToTheActiveIdentity"),
        suggestedAction: errorText(
          "main.repositoryManager.switchToItsOwningIdentityOrRefreshTheRepositoryList",
        ),
      });
    }

    return row;
  }

  private async register(root: string, identity: Identity): Promise<RepositorySummary> {
    const existing = this.db
      .select()
      .from(repositories)
      .where(and(eq(repositories.identityId, identity.id), eq(repositories.path, root)))
      .get();

    const now = new Date().toISOString();

    if (existing) {
      this.db
        .update(repositories)
        .set({ lastOpenedAt: now })
        .where(eq(repositories.id, existing.id))
        .run();
    } else {
      this.db
        .insert(repositories)
        .values({
          id: randomUUID(),
          identityId: identity.id,
          name: basename(root),
          path: root,
          favourite: 0,
          lastOpenedAt: now,
          createdAt: now,
        })
        .run();
    }

    const row = this.db
      .select()
      .from(repositories)
      .where(and(eq(repositories.identityId, identity.id), eq(repositories.path, root)))
      .get()!;

    return { ...toSummary(row), available: true };
  }

  updateMetadata(id: string, name: string, favourite: boolean): void {
    this.resolveActiveRepository(id);

    const trimmed = name.trim();

    if (!trimmed || trimmed.length > 120 || /[\x00-\x1f\x7f]/.test(trimmed))
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.updateRepository"),
        message: errorText(
          "main.repositoryManager.useARepositoryNameBetween1And120CharactersWithout",
        ),
      });

    this.db
      .update(repositories)
      .set({ name: trimmed, favourite: favourite ? 1 : 0 })
      .where(eq(repositories.id, id))
      .run();
  }

  private requireActiveIdentity(operation: string): Identity {
    const active = this.identity.getActive();

    if (!active) {
      throw new GitError({
        kind: "invalid-input",
        operation,
        message: errorText("main.repositoryManager.noIdentityIsActive"),
        suggestedAction: errorText(
          "main.repositoryManager.createOrSelectAnIdentityFirstBecauseRepositories",
        ),
      });
    }

    return active;
  }
}

function toSummary(row: RepositoryRow): Omit<RepositorySummary, "available"> {
  return {
    id: row.id,
    identityId: row.identityId,
    name: row.name,
    path: row.path,
    favourite: row.favourite === 1,
    ...(row.lastOpenedAt !== null && { lastOpenedAt: row.lastOpenedAt }),
  };
}
