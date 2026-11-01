import { errorText } from "@shared/error-codes";
import { errorMessage, GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import type { Identity } from "@shared/identity/identity";
import { randomUUID } from "node:crypto";
import type { GitService } from "../git-service";
import { assertFullObjectId } from "../validation";

export async function createPullAutostash(git: GitService, root: string, identity: Identity) {
  const status = await git.status(root);
  if (status.changes.some((change) => change.kind === "unmerged"))
    throw new GitError({
      kind: "invalid-input",
      operation: t("operations.pull"),
      message: errorText("main.git.pullAutostash.resolveExistingConflictsBeforePulling"),
    });
  if (status.changes.some((change) => change.submodule.startsWith("S")))
    throw new GitError({
      kind: "invalid-input",
      operation: t("operations.pull"),
      message: errorText(
        "main.git.pullAutostash.commitOrStashChangesInsideSubmodulesBeforePulling",
      ),
    });
  const message = t("main.git.pullAutostash.edaPullAutostash", { value1: randomUUID() });
  try {
    await git.exec(
      [
        "-c",
        `user.name=${identity.gitName}`,
        "-c",
        `user.email=${identity.gitEmail}`,
        "-c",
        "submodule.recurse=false",
        "stash",
        "push",
        "--include-untracked",
        "--message",
        message,
      ],
      { cwd: root, operation: t("operations.saveLocalChangesForPull") },
    );
    const oid = (
      await git.exec(["rev-parse", "--verify", "refs/stash"], {
        cwd: root,
        operation: t("operations.identifyPullAutostash"),
      })
    ).stdout.trim();
    assertFullObjectId(oid, t("operations.pullAutostash"));
    const subject = (
      await git.exec(["show", "-s", "--format=%s", oid], {
        cwd: root,
        operation: t("operations.verifyPullAutostash"),
      })
    ).stdout.trim();
    if (!subject.endsWith(message))
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.pull"),
        message: errorText(
          "main.git.pullAutostash.theStashListChangedDuringPullInspectStashesBeforeRetrying",
        ),
      });
    return oid;
  } catch (error) {
    throw new GitError({
      kind: error instanceof GitError ? error.kind : "unknown",
      operation: t("operations.pull"),
      message: errorText("main.git.pullAutostash.couldNotFinishSavingLocalChangesForPull", {
        value1: errorMessage(
          error,
          errorText("main.git.pullAutostash.inspectTheRepositoryBeforeRetrying"),
        ),
      }),
    });
  }
}

export async function dropPullAutostash(git: GitService, root: string, oid: string) {
  const entries = (
    await git.exec(["stash", "list", "--format=%H %gd"], {
      cwd: root,
      operation: t("operations.locateRestoredPullAutostash"),
    })
  ).stdout
    .trim()
    .split("\n");
  const selector = entries.find((entry) => entry.startsWith(`${oid} `))?.split(" ")[1];
  if (!selector || !/^stash@\{\d+\}$/.test(selector)) return;
  const current = (
    await git.exec(["rev-parse", "--verify", selector], {
      cwd: root,
      operation: t("operations.verifyRestoredPullAutostash"),
    })
  ).stdout.trim();
  if (current !== oid) return;
  await git.exec(["stash", "drop", selector], {
    cwd: root,
    operation: t("operations.removeRestoredPullAutostash"),
  });
}
