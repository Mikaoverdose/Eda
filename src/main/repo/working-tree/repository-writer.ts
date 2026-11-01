import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t, type MessageKey } from "@shared/i18n";
import type { Identity } from "@shared/identity/identity";
import { commitConfigKeys, type CommitConfigGroup } from "@shared/identity/profile-session";
import type { IgnoreKind } from "@shared/repository/ignore";
import type { PartialStagePreview, PartialStageRequest } from "@shared/repository/partial-stage";
import type {
  BranchSummary,
  CommitPreview,
  CommitResult,
  TagSummary,
} from "@shared/repository/repository-write";
import { basename } from "node:path";
import { withLocalConfiguration } from "../../git/configuration/local-configuration";
import type { GitService } from "../../git/git-service";
import type { IdentityManager } from "../../identity/identity-manager";
import type { OperationManager } from "../../operations/operation-manager";
import type { ContentRecoveryRepository } from "../../persistence/content-recovery-repository";
import type { IdentityRepository } from "../../persistence/identity-repository";
import type { WorkflowJournal } from "../../persistence/workflow-journal";
import { CommitHistory } from "../history/commit-history";
import { RefHistory } from "../history/ref-history";
import { repositoryCapabilities } from "../lifecycle/repository-capabilities";
import { repositoryCommonDirectory } from "../lifecycle/repository-location";
import type { RepositoryManager } from "../lifecycle/repository-manager";
import { DiscardService } from "./discard-service";
import { IgnoreService } from "./ignore-service";
import { PartialStageService } from "./partial-stage-service";
import { WriteQueue } from "./write-queue";

export class RepositoryWriter {
  remoteOperation<T>(
    repositoryId: string,
    kind: string,
    work: (path: string, identity: Identity) => Promise<T>,
    kindKey?: MessageKey,
  ): Promise<T> {
    const captured = this.requireActiveIdentity(repositoryId);
    return this.write(repositoryId, (path) => work(path, captured), kind, undefined, true, kindKey);
  }

  private readonly queue = new WriteQueue();
  private readonly partial: PartialStageService;
  private readonly ignore: IgnoreService;
  private readonly discard?: DiscardService;
  private readonly commitHistory?: CommitHistory;
  private readonly refHistory?: RefHistory;

  constructor(
    private readonly git: GitService,
    private readonly repositories: RepositoryManager,
    private readonly identity: IdentityManager,
    private readonly identities: IdentityRepository,
    private readonly operations?: OperationManager,
    recovery?: ContentRecoveryRepository,
    journal?: WorkflowJournal,
  ) {
    this.partial = new PartialStageService(git);
    this.ignore = new IgnoreService(git);

    if (recovery) this.discard = new DiscardService(git, recovery);

    if (journal) {
      this.commitHistory = new CommitHistory(git, journal);
      this.refHistory = new RefHistory(git, journal);
    }
  }

  private recoveryService(): DiscardService {
    if (!this.discard)
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.discardChanges"),
        message: errorText("main.repositoryWriter.recoveryStorageIsUnavailableNoFilesWereChanged"),
      });

    return this.discard;
  }

  previewDiscard(repositoryId: string, paths: string[]) {
    const repository = this.repositories.resolveActiveRepository(repositoryId);

    return this.recoveryService().preview(
      repository.path,
      repository.identityId,
      repositoryId,
      paths,
    );
  }

  previewDiscardPartial(request: PartialStageRequest) {
    const repository = this.repositories.resolveActiveRepository(request.repositoryId);
    return this.recoveryService().previewPartial(repository.path, repository.identityId, request);
  }

  applyDiscard(repositoryId: string, token: string) {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    return this.write(
      repositoryId,
      (root) => this.recoveryService().apply(root, repository.identityId, repositoryId, token),
      t("main.repositoryWriter.discardWorktreeChanges"),
    );
  }

  listRecovery(repositoryId: string) {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    return this.recoveryService().list(repository.identityId, repositoryId);
  }

  forgetRecovery(repositoryId: string, id: string) {
    const repository = this.repositories.resolveActiveRepository(repositoryId);

    return this.write(
      repositoryId,
      async () => this.recoveryService().forget(repository.identityId, repositoryId, id),
      t("main.repositoryWriter.removeRecoverySnapshot"),
      undefined,
      false,
    );
  }

  savedRecoveryFile(repositoryId: string, id: string, path: string, stage?: number) {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    return this.recoveryService().savedFile(repository.identityId, repositoryId, id, path, stage);
  }

  restoreContent(repositoryId: string, id: string) {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    return this.write(
      repositoryId,
      (root) => this.recoveryService().restore(root, repository.identityId, repositoryId, id),
      t("main.repositoryWriter.restoreDiscardedFiles"),
    );
  }

  inspectIgnore(repositoryId: string, path: string, kind: IgnoreKind) {
    return this.ignore.inspect(
      this.repositories.resolveActiveRepository(repositoryId).path,
      path,
      kind,
    );
  }

  addIgnore(repositoryId: string, path: string, kind: IgnoreKind) {
    return this.write(
      repositoryId,
      (root) => this.ignore.add(root, path, kind),
      t("main.repositoryWriter.addIgnoreRule"),
    );
  }

  stopTracking(repositoryId: string, path: string) {
    return this.write(
      repositoryId,
      (root) => this.ignore.stopTracking(root, path),
      t("main.repositoryWriter.stopTrackingFile"),
    );
  }

  previewPartial(request: PartialStageRequest): Promise<PartialStagePreview> {
    const repository = this.repositories.resolveActiveRepository(request.repositoryId);
    return this.partial.preview(repository.path, repository.identityId, request);
  }

  applyPartial(repositoryId: string, token: string): Promise<void> {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    return this.write(
      repositoryId,
      (path) => this.partial.apply(path, repository.identityId, repositoryId, token),
      t("main.repositoryWriter.applySelectedChanges"),
    );
  }

  stage(repositoryId: string, paths?: readonly string[]): Promise<void> {
    return this.write(
      repositoryId,
      (path) => (paths && paths.length > 0 ? this.git.stage(path, paths) : this.git.stageAll(path)),
      t("main.repositoryWriter.stageChanges"),
      () => this.stage(repositoryId, paths),
    );
  }

  unstage(repositoryId: string, paths?: readonly string[]): Promise<void> {
    return this.write(
      repositoryId,
      (path) =>
        paths && paths.length > 0 ? this.git.unstage(path, paths) : this.git.unstageAll(path),
      t("main.repositoryWriter.unstageChanges"),
      () => this.unstage(repositoryId, paths),
    );
  }

  async previewCommit(repositoryId: string): Promise<CommitPreview> {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    const expected = this.requireActiveIdentity(repositoryId);
    const [check, stats, head] = await Promise.all([
      this.identity.verifyEffectiveIdentity(repository.path, expected),
      this.git.exec(
        ["diff", "--cached", "--numstat", "-z", "--no-renames", "--no-ext-diff", "--no-textconv"],
        {
          cwd: repository.path,
          operation: t("operations.previewStagedTotals"),
          maxStdoutBytes: 4 * 1024 * 1024,
        },
      ),
      this.git.exec(["rev-parse", "--verify", "--quiet", "HEAD"], {
        cwd: repository.path,
        operation: t("operations.previewCommitAncestry"),
        allowedExitCodes: [0, 1],
      }),
    ]);

    let additions = 0,
      deletions = 0,
      binaryFiles = 0;

    for (const row of stats.stdout.split("\0").filter(Boolean)) {
      const [added, removed] = row.split("\t");
      if (added === "-" || removed === "-") binaryFiles++;
      else {
        additions += Number(added) || 0;
        deletions += Number(removed) || 0;
      }
    }

    const refs =
      head.exitCode === 0
        ? await this.git.exec(
            [
              "for-each-ref",
              `--contains=${head.stdout.trim()}`,
              "--format=%(refname:short)",
              "refs/remotes",
            ],
            {
              cwd: repository.path,
              operation: t("operations.inspectSharedHead"),
              maxStdoutBytes: 1024 * 1024,
            },
          )
        : null;

    return {
      author: { name: expected.gitName, email: expected.gitEmail },
      matchesProfile: check.matches,
      signingEnabled: expected.signing.signCommits,
      signing: expected.signing.signCommits
        ? `${expected.signing.format.toUpperCase()}, ${expected.signing.keyRef ?? t("main.repositoryWriter.defaultKey")}`
        : t("main.repositoryWriter.unsigned"),
      additions,
      deletions,
      binaryFiles,
      sharedRefs: refs?.stdout.trim().split("\n").filter(Boolean) ?? [],
    };
  }

  commit(
    repositoryId: string,
    message: string,
    options: { amend?: boolean; signOff?: boolean } = {},
  ): Promise<CommitResult> {
    const expected = this.requireActiveIdentity(repositoryId);
    return this.write(
      repositoryId,
      (path) => this.commitInPlace(path, repositoryId, message, options, expected),
      options.amend ? t("main.repositoryWriter.amendCommit") : t("operationTitles.commit"),
    );
  }

  private async commitInPlace(
    path: string,
    repositoryId: string,
    message: string,
    options: { amend?: boolean; signOff?: boolean },
    expected: Identity,
  ): Promise<CommitResult> {
    this.identity.assertOperationIdentity(expected);

    const commit = () => this.git.commit(path, message, options, expected);

    return this.commitHistory
      ? this.commitHistory.run(path, repositoryId, expected, options.amend ?? false, commit)
      : { oid: await commit() };
  }

  stageAndCommit(
    repositoryId: string,
    paths: readonly string[] | undefined,
    message: string,
    options: { amend?: boolean; signOff?: boolean } = {},
  ): Promise<CommitResult> {
    const expected = this.requireActiveIdentity(repositoryId);
    return this.write(repositoryId, async (path) => {
      if (paths && paths.length > 0) await this.git.stage(path, paths);
      else await this.git.stageAll(path);
      return this.commitInPlace(path, repositoryId, message, options, expected);
    });
  }

  createBranch(
    repositoryId: string,
    name: string,
    options: { checkout?: boolean; startPoint?: string } = {},
  ): Promise<void> {
    const expected = this.requireActiveIdentity(repositoryId);

    return this.write(
      repositoryId,
      async (path) => {
        const before = await this.git.status(path);
        const tip = options.startPoint ?? before.branch.oid;
        const create = () => this.git.createBranch(path, name, options);

        if (!this.refHistory || !tip) return create();

        await this.refHistory.run(
          path,
          repositoryId,
          expected,
          { kind: "branch-create", name, tip, checkedOut: !!options.checkout },
          create,
        );
      },
      t("main.repositoryWriter.createBranch"),
    );
  }

  checkoutBranch(repositoryId: string, name: string): Promise<void> {
    const expected = this.requireActiveIdentity(repositoryId);

    return this.write(
      repositoryId,
      async (path) => {
        const checkout = () => this.git.checkoutBranch(path, name);

        if (!this.refHistory) return checkout();

        const tip = (
          await this.git.exec(["rev-parse", "--verify", `refs/heads/${name}`], {
            cwd: path,
            operation: t("operations.reviewCheckoutBranch"),
          })
        ).stdout.trim();

        await this.refHistory.run(
          path,
          repositoryId,
          expected,
          { kind: "checkout", name, tip },
          checkout,
        );
      },
      t("main.repositoryWriter.checkoutBranch"),
    );
  }

  deleteBranch(
    repositoryId: string,
    name: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const expected = this.requireActiveIdentity(repositoryId);

    return this.write(
      repositoryId,
      async (path) => {
        const remove = () => this.git.deleteBranch(path, name, options);

        if (!this.refHistory) return remove();

        const tip = (
          await this.git.exec(["rev-parse", "--verify", `refs/heads/${name}`], {
            cwd: path,
            operation: t("operations.reviewDeletedBranch"),
          })
        ).stdout.trim();

        await this.refHistory.run(
          path,
          repositoryId,
          expected,
          { kind: "branch-delete", name, tip },
          remove,
        );
      },
      t("main.repositoryWriter.deleteBranch"),
    );
  }

  renameBranch(repositoryId: string, from: string, to: string): Promise<void> {
    const expected = this.requireActiveIdentity(repositoryId);

    return this.write(
      repositoryId,
      async (path) => {
        const rename = () => this.git.renameBranch(path, from, to);

        if (!this.refHistory) return rename();

        const tip = (
          await this.git.exec(["rev-parse", "--verify", `refs/heads/${from}`], {
            cwd: path,
            operation: t("operations.reviewRenamedBranch"),
          })
        ).stdout.trim();

        await this.refHistory.run(
          path,
          repositoryId,
          expected,
          { kind: "branch-rename", from, to, tip },
          rename,
        );
      },
      t("main.repositoryWriter.renameBranch"),
    );
  }

  listBranches(repositoryId: string): Promise<BranchSummary[]> {
    const { path } = this.repositories.resolveActiveRepository(repositoryId);
    return this.git.listBranches(path);
  }

  createTag(
    repositoryId: string,
    name: string,
    options: { message?: string; target?: string; sign?: boolean } = {},
  ): Promise<void> {
    const expected = this.requireActiveIdentity(repositoryId);

    return this.write(repositoryId, async (path) => {
      return this.git.createTag(path, name, options, expected);
    });
  }

  deleteTag(repositoryId: string, name: string): Promise<void> {
    return this.write(
      repositoryId,
      (path) => this.git.deleteTag(path, name),
      t("main.repositoryWriter.deleteTag"),
    );
  }

  checkoutTag(repositoryId: string, name: string): Promise<void> {
    const expected = this.requireActiveIdentity(repositoryId);

    return this.write(
      repositoryId,
      async (path) => {
        const checkout = () => this.git.checkoutTag(path, name);

        if (!this.refHistory) return checkout();

        const tip = (
          await this.git.exec(["rev-parse", "--verify", `refs/tags/${name}^{commit}`], {
            cwd: path,
            operation: t("operations.reviewCheckoutTag"),
          })
        ).stdout.trim();

        await this.refHistory.run(
          path,
          repositoryId,
          expected,
          { kind: "checkout", name: null, tip },
          checkout,
        );
      },
      t("main.repositoryWriter.checkoutTag"),
    );
  }

  verifyTag(repositoryId: string, name: string) {
    const { path } = this.repositories.resolveActiveRepository(repositoryId);
    return this.git.verifyTag(path, name);
  }

  listTags(repositoryId: string): Promise<TagSummary[]> {
    const { path } = this.repositories.resolveActiveRepository(repositoryId);
    return this.git.listTags(path);
  }

  private write<T>(
    repositoryId: string,
    work: (path: string) => Promise<T>,
    kind = t("main.repositoryWriter.updateRepository"),
    retry?: () => Promise<unknown>,
    needsWriteAccess = true,
    kindKey?: MessageKey,
  ): Promise<T> {
    const { path, identityId } = this.repositories.resolveActiveRepository(repositoryId);
    const execute = () =>
      this.identity.serialize(async () => {
        if (!this.identities.findById(identityId))
          throw new GitError({
            kind: "invalid-input",
            operation: t("operations.writeRepository"),
            message: errorText(
              "main.repositoryWriter.theOriginatingProfileWasDeletedBeforeThisOperationCouldStart",
            ),
          });

        const commonDirectory = await repositoryCommonDirectory(this.git, path);

        return this.queue.run(commonDirectory, async () => {
          const capabilities = needsWriteAccess
            ? await repositoryCapabilities(this.git, path)
            : { write: true };

          if (!capabilities.write)
            throw new GitError({
              kind: "invalid-input",
              operation: kind,
              message: errorText("errors.operationBlocked", {
                reason: capabilities.reason ?? t("main.repositoryWriter.thisRepositoryIsReadOnly"),
              }),
            });

          return work(path);
        });
      });

    return this.operations
      ? this.operations.run(
          { profileId: identityId, repositoryId, repositoryName: basename(path) },
          kind,
          execute,
          retry
            ? async () => {
                const current = this.repositories.resolveActiveRepository(repositoryId);

                if (current.identityId !== identityId || current.path !== path)
                  throw new GitError({
                    kind: "invalid-input",
                    operation: t("operations.retryOperation"),
                    message: errorText(
                      "main.repositoryWriter.theOriginalRepositoryContextChangedReopenItBeforeRetrying",
                    ),
                  });

                return retry();
              }
            : undefined,
          kindKey,
        )
      : execute();
  }

  applyProfile(repositoryId: string): Promise<void> {
    const expected = this.requireActiveIdentity();
    return this.write(
      repositoryId,
      (path) => this.identity.applyToRepository(path, expected),
      t("main.repositoryWriter.applyProfile"),
    );
  }

  clearLocalCommitConfig(repositoryId: string, group: CommitConfigGroup): Promise<void> {
    const keys = commitConfigKeys(group);

    return this.write(
      repositoryId,
      (path) =>
        withLocalConfiguration(
          this.git,
          path,
          t("main.repositoryWriter.removeLocalCommitOverrides"),
          async (file) => {
            for (const key of keys)
              await this.git.exec(
                ["config", "--file", file, "--no-includes", "--unset-all", "--", key],
                {
                  cwd: path,
                  operation: t("operations.removeLocalCommitOverride"),
                  allowedExitCodes: [0, 5],
                },
              );
          },
        ),
      t("main.repositoryWriter.removeLocalCommitOverrides"),
    );
  }

  private requireActiveIdentity(repositoryId?: string) {
    const id = this.identities.getActiveId();
    const identity = id ? this.identities.findById(id) : undefined;

    if (!identity) {
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.commit"),
        message: errorText("main.repositoryWriter.thereIsNoActiveIdentity"),
        suggestedAction: errorText("main.repositoryWriter.selectAnIdentityBeforeCommitting"),
      });
    }

    return repositoryId ? this.identity.forRepository(repositoryId, identity) : identity;
  }
}
