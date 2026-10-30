import { MAX_STASH_ENTRIES } from "@shared/workflows/stashes";
import { t } from "@shared/i18n";
import { GitError } from "@shared/errors";
import type { GitService } from "../git-service";
import { assertFullObjectId } from "../validation";

export async function readStashHistory(git: GitService, root: string) {
  const { stdout } = await git.exec(
    ["stash", "list", "-z", `--max-count=${MAX_STASH_ENTRIES}`, "--format=%H%x00%P%x00%gd%x00%gs"],
    { cwd: root, operation: t("operations.readStashGraph"), maxStdoutBytes: 1024 * 1024 },
  );
  const fields = stdout.split("\0");

  if (fields.at(-1) === "") fields.pop();

  const labels = new Map<string, string[]>();
  const tips: string[] = [];

  if (fields.length % 4)
    throw new GitError({
      kind: "invalid-input",
      operation: t("operations.readStashGraph"),
      message: t("main.git.stashHistory.gitReturnedAnUnreadableStashList"),
    });

  const label = (oid: string, text: string) => labels.set(oid, [...(labels.get(oid) ?? []), text]);

  for (let index = 0; index < fields.length; index += 4) {
    const oid = fields[index]!;
    const parents = fields[index + 1]!.split(" ");
    const selector = fields[index + 2]!;

    if (!/^stash@\{\d+\}$/.test(selector) || parents.length < 2 || parents.length > 3)
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.readStashGraph"),
        message: t("main.git.stashHistory.gitReturnedAnUnsupportedStashStructure"),
      });

    for (const object of [oid, ...parents])
      assertFullObjectId(object, t("operations.readStashGraph"));

    tips.push(oid);
    label(oid, `${selector}: ${fields[index + 3]}`);
    label(parents[1]!, t("main.git.stashHistory.stagedSnapshot", { selector: selector }));

    if (parents[2])
      label(parents[2], t("main.git.stashHistory.untrackedSnapshot", { selector: selector }));
  }

  return { tips: [...new Set(tips)], labels };
}
