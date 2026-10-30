import { t } from "@shared/i18n";
import { createHash } from "node:crypto";
import type { RepositoryStatus } from "@shared/repository/repository-read";
import type { GitService } from "../../git/git-service";

export async function workflowFingerprint(
  git: GitService,
  root: string,
  status: RepositoryStatus,
  contentOnly = false,
) {
  const index = await git.exec(["ls-files", "--stage", "-z"], {
    cwd: root,
    operation: t("operations.reviewWorkflowIndex"),
  });
  const working = await git.exec(["diff", "--binary", "--no-ext-diff", "--no-textconv", "--"], {
    cwd: root,
    operation: t("operations.reviewWorkflowWorkingFiles"),
  });

  return createHash("sha256")
    .update(JSON.stringify(contentOnly ? status.changes : status))
    .update(index.stdoutBytes)
    .update(working.stdoutBytes)
    .digest("hex");
}
