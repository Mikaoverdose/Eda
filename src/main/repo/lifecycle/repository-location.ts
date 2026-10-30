import { t } from "@shared/i18n";
import { realpath } from "node:fs/promises";
import type { GitService } from "../../git/git-service";

export async function repositoryCommonDirectory(git: GitService, root: string): Promise<string> {
  const result = await git.exec(["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    operation: t("operations.identifySharedRepository"),
    maxStdoutBytes: 64 * 1024,
  });
  const canonical = await realpath(result.stdout.trim());

  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}
