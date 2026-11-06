import { t } from "@shared/i18n";
import type { RepositoryStatus } from "@shared/repository/repository-read";
import { createHash } from "node:crypto";
import type { GitService } from "../../git/git-service";

export async function readWorkflowContents(git: GitService, root: string) {
  const index = await git.exec(["ls-files", "--stage", "-z"], {
    cwd: root,
    operation: t("operations.reviewWorkflowIndex"),
  });
  const working = await git.exec(["diff", "--binary", "--no-ext-diff", "--no-textconv", "--"], {
    cwd: root,
    operation: t("operations.reviewWorkflowWorkingFiles"),
  });

  return { index: index.stdoutBytes, working: working.stdoutBytes };
}

// Recovery journals persist this digest. Keep the serialized status and raw Git bytes in this order.
export function fingerprintContents(
  status: RepositoryStatus | RepositoryStatus["changes"],
  contents: { index: Buffer; working: Buffer },
) {
  return createHash("sha256")
    .update(JSON.stringify(status))
    .update(contents.index)
    .update(contents.working)
    .digest("hex");
}

export async function workflowFingerprint(
  git: GitService,
  root: string,
  status: RepositoryStatus | RepositoryStatus["changes"],
) {
  return fingerprintContents(status, await readWorkflowContents(git, root));
}
