import {
  chmodSync,
  copyFileSync,
  constants,
  existsSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { openDatabase } from "./database";

export async function prepareReleaseDataImport(
  releasePath: string,
  developmentPath: string,
): Promise<void> {
  const fail = () =>
    new GitError({
      kind: "invalid-input",
      operation: t("operations.importReleaseData"),
      message: errorText("main.appData.releaseDataUnavailable"),
    });
  if (!existsSync(releasePath)) throw fail();
  if (realpathSync(releasePath) === realpathSync(developmentPath)) throw fail();

  const sourcePath = join(releasePath, "eda.db");
  if (!existsSync(sourcePath) || !lstatSync(sourcePath).isFile()) throw fail();

  const stage = mkdtempSync(join(developmentPath, ".release-import-"));

  try {
    const source = new DatabaseSync(sourcePath, { readOnly: true });
    try {
      if (
        !source
          .prepare(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
          )
          .get()
      )
        throw fail();
      await backup(source, join(stage, "eda.db"));
    } finally {
      source.close();
    }
    const candidate = openDatabase(join(stage, "eda.db"));
    try {
      if (
        candidate.raw.prepare("PRAGMA quick_check").get()?.["quick_check"] !== "ok" ||
        candidate.raw.prepare("PRAGMA foreign_key_check").all().length
      )
        throw fail();
    } finally {
      candidate.close();
    }

    const vault = join(releasePath, "secrets.vault");
    if (existsSync(vault)) {
      if (!lstatSync(vault).isFile()) throw fail();
      copyFileSync(vault, join(stage, "secrets.vault"), constants.COPYFILE_EXCL);
      if (process.platform !== "win32") chmodSync(join(stage, "secrets.vault"), 0o600);
    }

    rmSync(join(developmentPath, ".release-import-pending"), { recursive: true, force: true });
    renameSync(stage, join(developmentPath, ".release-import-pending"));
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

// Run before opening the development database or creating any services.
export function applyReleaseDataImport(developmentPath: string): void {
  const stage = join(developmentPath, ".release-import-pending");
  const managed = ["eda.db", "eda.db-wal", "eda.db-shm", "eda.db-journal", "secrets.vault"];
  const moved: string[] = [];
  const installed: string[] = [];
  let preserveBackup = false;

  if (!lstatSync(join(stage, "eda.db")).isFile())
    throw new GitError({
      kind: "invalid-input",
      operation: t("operations.importReleaseData"),
      message: errorText("main.appData.releaseDataUnavailable"),
    });

  try {
    for (const name of managed) {
      const path = join(developmentPath, name);
      if (existsSync(path)) {
        renameSync(path, join(stage, `previous-${name}`));
        moved.push(name);
      }
    }
    for (const name of ["eda.db", "secrets.vault"]) {
      if (existsSync(join(stage, name))) {
        renameSync(join(stage, name), join(developmentPath, name));
        installed.push(name);
      }
    }
  } catch (error) {
    preserveBackup = true;
    for (const name of installed) rmSync(join(developmentPath, name), { force: true });
    for (const name of moved)
      renameSync(join(stage, `previous-${name}`), join(developmentPath, name));
    preserveBackup = false;
    throw error;
  } finally {
    if (!preserveBackup) rmSync(stage, { recursive: true, force: true });
  }
}
