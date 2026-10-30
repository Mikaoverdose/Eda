import { t } from "@shared/i18n";
import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import type { GitService } from "../../git/git-service";
import type { RepositoryCapabilities } from "@shared/repository/repository-read";

export async function repositoryCapabilities(
  git: GitService,
  path: string,
): Promise<RepositoryCapabilities> {
  const directories = await git.exec(
    ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"],
    { cwd: path, operation: t("operations.inspectRepositoryAccess"), maxStdoutBytes: 64 * 1024 },
  );
  const roots = directories.stdout.trim().split(/\r?\n/);

  try {
    await Promise.all([path, ...roots].map((root) => access(root, constants.W_OK)));
    await access(join(roots[0]!, "index"), constants.W_OK).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    return { write: true };
  } catch {
    return {
      write: false,
      reason: t("main.repositoryCapabilities.theWorktreeOrGitMetadataIsReadOnly"),
    };
  }
}
