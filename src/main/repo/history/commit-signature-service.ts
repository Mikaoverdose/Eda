import { t } from "@shared/i18n";
import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import type { CommitSignatureVerification } from "@shared/repository/repository-read";
import type { GitService } from "../../git/git-service";
import { assertFullObjectId } from "../../git/validation";
import type { CommitSignatureRepository } from "../../persistence/commit-signature-repository";
import type { RepositoryManager } from "../lifecycle/repository-manager";

export class CommitSignatureService {
  private readonly pending = new Map<string, Promise<CommitSignatureVerification>>();

  constructor(
    private readonly git: Pick<GitService, "commitSignature" | "inspectCommit">,
    private readonly repositories: Pick<RepositoryManager, "resolveActiveRepository">,
    private readonly cache: CommitSignatureRepository,
  ) {}

  async read(
    repositoryId: string,
    oid: string,
    refresh = false,
  ): Promise<CommitSignatureVerification> {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    assertFullObjectId(oid, t("operations.verifyCommitSignature"));
    const key = JSON.stringify([repository.identityId, repository.id, oid]);

    if (!refresh) {
      const pending = this.pending.get(key);
      if (pending) return pending;

      const cached = this.cache.read(repository.identityId, repository.id, oid);
      if (cached) return cached;
    }

    const request: Promise<CommitSignatureVerification> = this.git
      .commitSignature(repository.path, oid)
      .then((signature) => {
        const current = this.repositories.resolveActiveRepository(repositoryId);
        if (current.identityId !== repository.identityId || current.path !== repository.path)
          throw new GitError({
            kind: "invalid-input",
            operation: t("operations.verifyCommitSignature"),
            message: errorText("main.repositoryManager.theRepositoryChangedRefreshAndTryAgain"),
          });

        const latest = this.pending.get(key);
        if (latest === request) {
          this.cache.record(repository.identityId, repository.id, oid, signature);
          return signature;
        }

        // Readers waiting on superseded work must receive the recheck's result too.
        return latest ?? this.cache.read(repository.identityId, repository.id, oid) ?? signature;
      });

    this.pending.set(key, request);

    try {
      return await request;
    } finally {
      if (this.pending.get(key) === request) this.pending.delete(key);
    }
  }

  async inspect(repositoryId: string, oid: string, refresh = false) {
    const signature = await this.read(repositoryId, oid, refresh);
    const repository = this.repositories.resolveActiveRepository(repositoryId);

    return this.git.inspectCommit(repository.path, oid, signature);
  }
}
