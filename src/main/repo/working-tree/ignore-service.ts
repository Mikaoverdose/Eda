import { t } from "@shared/i18n";
import { lstat, readFile, open } from "node:fs/promises";
import { join, posix } from "node:path";
import { GitError } from "@shared/errors";
import type { IgnoreInspection, IgnoreKind } from "@shared/repository/ignore";
import { assertRepositoryPath } from "../../git/validation";
import type { GitService } from "../../git/git-service";

const invalid = (message: string) =>
  new GitError({ kind: "invalid-input", operation: t("operations.ignoreFile"), message });

export function ignoreRule(path: string, kind: IgnoreKind): string {
  assertRepositoryPath(path, t("operations.ignoreFile"));

  if (/[\r\n\\]/.test(path))
    throw invalid(t("main.ignoreService.thisPathCannotBeRepresentedSafelyByThisIgnoreEditor"));

  const escape = (value: string) => value.replace(/[\[\]*?!# ]/g, "\\$&");

  if (kind === "extension") {
    const extension = posix.extname(path);
    if (!extension)
      throw invalid(t("main.ignoreService.thisFileHasNoExtensionIgnoreItsPathInstead"));
    return `*${escape(extension)}`;
  }

  if (kind === "directory") {
    const directory = posix.dirname(path);
    if (directory === ".")
      throw invalid(
        t("main.ignoreService.thisFileIsInTheRepositoryRootChoosePathOrExtensionInstead"),
      );
    return `/${escape(directory)}/`;
  }

  return `/${escape(path)}`;
}

export class IgnoreService {
  constructor(private readonly git: GitService) {}

  async inspect(root: string, path: string, kind: IgnoreKind): Promise<IgnoreInspection> {
    const rule = ignoreRule(path, kind);
    const [ignored, tracked] = await Promise.all([
      this.git.exec(["check-ignore", "--no-index", "-v", "-z", "--stdin"], {
        cwd: root,
        operation: t("operations.explainIgnoredPath"),
        stdin: `${path}\0`,
        allowedExitCodes: [0, 1],
      }),
      this.git.exec(["--literal-pathspecs", "ls-files", "-z", "--", path], {
        cwd: root,
        operation: t("operations.checkTrackedPath"),
      }),
    ]);

    const [source, line, pattern] = ignored.stdout.split("\0");

    return {
      rule,
      tracked: tracked.stdout.length > 0,
      ignored: ignored.exitCode === 0 && !!pattern && !pattern.startsWith("!"),
      ...(source ? { source, line: line ?? "", pattern: pattern ?? "" } : {}),
    };
  }

  async add(root: string, path: string, kind: IgnoreKind): Promise<void> {
    const rule = ignoreRule(path, kind);
    const filename = join(root, ".gitignore");
    const stat = await lstat(filename).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });

    if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024))
      throw invalid(
        t("main.ignoreService.theRootGitignoreMustBeARegularFileUnder1MiBEditItExternally"),
      );

    const bytes = stat ? await readFile(filename) : Buffer.alloc(0);
    let content: string;

    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw invalid(
        t("main.ignoreService.theGitignoreFileIsNotUtf8EditItExternallyToPreserveItsEncoding"),
      );
    }

    if (content.split(/\r?\n/).includes(rule)) return;

    const newline = content.includes("\r\n") ? "\r\n" : "\n";
    const file = await open(filename, stat ? "r+" : "wx");

    try {
      const current = await file.stat();

      if (
        stat &&
        (current.ino !== stat.ino || current.size !== stat.size || current.mtimeMs !== stat.mtimeMs)
      )
        throw invalid(t("main.ignoreService.theGitignoreFileChangedPreviewTheRuleAgain"));

      const appended = `${content && !content.endsWith("\n") ? newline : ""}${rule}${newline}`;

      await file.write(Buffer.from(appended), 0, Buffer.byteLength(appended), bytes.length);
      await file.sync();
    } finally {
      await file.close();
    }
  }

  async stopTracking(root: string, path: string): Promise<void> {
    assertRepositoryPath(path, t("operations.stopTrackingFile"));
    await this.git.exec(["--literal-pathspecs", "rm", "--cached", "--", path], {
      cwd: root,
      operation: t("operations.stopTrackingFile"),
    });
  }
}
