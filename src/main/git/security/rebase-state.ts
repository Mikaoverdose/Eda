import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { lstat, open } from "node:fs/promises";
import { join } from "node:path";
import type { GitService } from "../git-service";

export async function assertSafeRebaseState(git: GitService, root: string): Promise<void> {
  const result = await git.exec(["rev-parse", "--absolute-git-dir"], {
    cwd: root,
    operation: t("operations.inspectWorkflow"),
  });
  const directory = result.stdout.replace(process.platform === "win32" ? /\r?\n$/ : /\n$/, "");
  const path = join(directory, "rebase-merge", "git-rebase-todo");
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return;
  const invalid = () =>
    new GitError({
      kind: "invalid-input",
      operation: t("operations.rebase"),
      message: errorText("main.git.rebaseState.unsafeInstructions"),
    });
  if (!info.isFile() || info.size > 64 * 1024) throw invalid();
  const handle = await open(path, "r");
  let text: string;
  try {
    const buffer = Buffer.alloc(64 * 1024 + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 64 * 1024) throw invalid();
    text = buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
  for (const line of text.split("\n")) {
    const command = line.trim();
    if (!command || command.startsWith("#")) continue;
    if (/^(?:noop|break|b)$/.test(command)) continue;
    if (/^(?:pick|p|reword|r|edit|e|squash|s|drop|d) [a-f0-9]{4,64}(?:\s|$)/.test(command))
      continue;
    if (/^(?:fixup|f) (?:-[cC] )?[a-f0-9]{4,64}(?:\s|$)/.test(command)) continue;
    throw invalid();
  }
}
