import { referenceLink, type ReferenceLinkKind } from "@shared/repository/reference-link";
import type { GitService } from "../git/git-service";
import type { RepositoryManager } from "./lifecycle/repository-manager";

const MAX_IGNORED_FILES = 5_000;

export class RepositoryReader {
  constructor(
    private readonly git: Pick<
      GitService,
      "remoteNames" | "readConfig" | "ignoredFiles" | "commitTemplate"
    >,
    private readonly repositories: Pick<RepositoryManager, "resolveActiveRepository">,
    private readonly gitlabInstances: (profileId: string) => readonly string[],
  ) {}

  async referenceUrl(repositoryId: string, kind: ReferenceLinkKind, name: string) {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    const names = await this.git.remoteNames(repository.path);
    let remote = names.includes("origin") ? "origin" : names[0];

    if (kind === "remote-branch")
      remote = names
        .sort((first, second) => second.length - first.length)
        .find((candidate) => name.startsWith(`${candidate}/`));

    if (!remote) return null;

    const reference = kind === "remote-branch" ? name.slice(remote.length + 1) : name;
    const url = await this.git.readConfig(`remote.${remote}.url`, { cwd: repository.path });

    return url
      ? referenceLink(url, kind, reference, this.gitlabInstances(repository.identityId))
      : null;
  }

  async ignoredFiles(repositoryId: string) {
    const repository = this.repositories.resolveActiveRepository(repositoryId);
    const paths = await this.git.ignoredFiles(repository.path);

    return {
      paths: paths.slice(0, MAX_IGNORED_FILES),
      truncated: paths.length > MAX_IGNORED_FILES,
    };
  }

  async commitTemplate(repositoryId: string) {
    const repository = this.repositories.resolveActiveRepository(repositoryId);

    return this.git.commitTemplate(repository.path);
  }
}
