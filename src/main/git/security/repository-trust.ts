import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { readRegularFile } from "../../filesystem/read-regular-file";
import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { RepositoryTrustStore } from "../../persistence/repository-trust-store";

const missing = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
};
const refused = () =>
  new GitError({
    kind: "not-a-repository",
    operation: t("operations.openRepository"),
    message: errorText("main.repositoryTrust.required"),
  });

async function pointer(path: string, prefix = "") {
  const { bytes } = await readRegularFile(path, 4096, refused);
  const text = bytes.toString("utf8").replace(/\r?\n$/, "");
  if (!text.startsWith(prefix) || text.length === prefix.length || /[\0\r\n]/.test(text))
    throw refused();
  const target = resolve(dirname(path), text.slice(prefix.length));
  if (process.platform === "win32" && /^[\\/]{2}/.test(target)) throw refused();
  return target;
}

async function metadata(root: string, bare: boolean) {
  const marker = bare ? root : join(root, ".git");
  const entry = await lstat(marker);
  if (!entry.isDirectory() && (!entry.isFile() || bare)) throw refused();
  const gitDir = await realpath(entry.isDirectory() ? marker : await pointer(marker, "gitdir: "));
  const common = await pointer(join(gitDir, "commondir")).catch((error) => {
    if (missing(error)) return gitDir;
    throw error;
  });
  const commonDir = await realpath(common);
  const ids = await Promise.all(
    [root, gitDir, commonDir].map(async (path) => {
      const info = await stat(path, { bigint: true });
      if (!info.isDirectory()) throw refused();
      return [path, String(info.dev), String(info.ino), String(info.birthtimeNs)];
    }),
  );
  return { root, gitDir, commonDir, fingerprint: JSON.stringify(ids) };
}

export class RepositoryTrust {
  constructor(
    private readonly store: RepositoryTrustStore,
    private readonly confirm: (path: string, source?: string) => Promise<boolean>,
    readonly neutralDirectory: string,
  ) {}

  async findRoot(path: string) {
    let root: string;
    try {
      root = await realpath(path);
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
    const selected = root;
    while (true) {
      try {
        const marker = join(root, ".git");
        const entry = await lstat(marker);
        if (root !== selected && entry.isDirectory()) await lstat(join(marker, "HEAD"));
        return root;
      } catch (error) {
        if (!missing(error)) throw error;
      }
      const parent = dirname(root);
      if (parent === root) return null;
      root = parent;
    }
  }

  async authorize(root: string, bare = false) {
    const record = await metadata(await realpath(root), bare);
    if (this.store.matches(record.root, record.fingerprint)) return;
    if (!(await this.confirm(record.root))) throw refused();
    if ((await metadata(await realpath(root), bare)).fingerprint !== record.fingerprint)
      throw refused();
    this.store.remember(record.root, record.fingerprint);
  }

  async approveCreation(path: string, source?: string) {
    if (!(await this.confirm(path, source))) throw refused();
  }

  async rememberCreated(path: string) {
    const record = await metadata(await realpath(path), false);
    this.store.remember(record.root, record.fingerprint);
  }

  async checked(root: string) {
    try {
      const record = await metadata(await realpath(root), false);
      if (!this.store.matches(record.root, record.fingerprint)) throw refused();
      return record;
    } catch (error) {
      if (missing(error)) throw refused();
      throw error;
    }
  }
}
