import { t } from "@shared/i18n";
import type { GitService } from "../../git/git-service";

export async function isPublishedCommit(git: GitService, root: string, oid: string) {
  const refs = await git.exec(
    ["for-each-ref", `--contains=${oid}`, "--count=1", "--format=%(objectname)", "refs/remotes"],
    { cwd: root, operation: t("operations.inspectPublishedCommit"), maxStdoutBytes: 1024 },
  );
  return Boolean(refs.stdout.trim());
}

export async function publishedRangeCount(
  git: GitService,
  root: string,
  head: string,
  retained: string,
): Promise<number> {
  if (!head) return 0;

  const count = async (unpublished: boolean) => {
    const result = await git.exec(
      [
        "rev-list",
        "--count",
        head,
        ...(retained ? [`^${retained}`] : []),
        ...(unpublished ? ["--not", "--remotes"] : []),
        "--",
      ],
      { cwd: root, operation: t("operations.inspectPublishedHistory"), maxStdoutBytes: 1024 },
    );

    return Number(result.stdout.trim());
  };

  return Math.max(0, (await count(false)) - (await count(true)));
}
