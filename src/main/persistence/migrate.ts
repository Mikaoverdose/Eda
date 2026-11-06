import { ERROR_CODE } from "@shared/error-codes";
import { AppError } from "@shared/errors";
import { closeSync, openSync } from "node:fs";
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  id: string;
  sql: string;
}

export function applyMigrations(
  sqlite: DatabaseSync,
  migrations: readonly Migration[],
  options: { backupPath?: string } = {},
): void {
  if (sqlite.isTransaction) throw new AppError(ERROR_CODE.MIGRATION_TRANSACTION_REQUIRED);

  // VACUUM INTO includes WAL changes and must run outside the transaction.
  if (
    options.backupPath &&
    sqlite
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = '__drizzle_migrations'")
      .get()
  ) {
    const applied = sqlite.prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations").get() as {
      count: number;
    };
    if (applied.count > 0 && applied.count < migrations.length) {
      closeSync(openSync(options.backupPath, "wx", 0o600));
      sqlite.prepare("VACUUM INTO ?").run(options.backupPath);
    }
  }

  // SQLite ignores foreign_keys changes inside a transaction.
  // Turn it off first so rebuilding a parent table doesn't delete child rows.
  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(
      "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id TEXT PRIMARY KEY NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL)",
    );

    const applied = sqlite
      .prepare("SELECT id, hash FROM __drizzle_migrations ORDER BY id")
      .all() as { id: string; hash: string }[];
    const expected = migrations.map(({ id, sql }) => ({
      id,
      hash: createHash("sha256").update(sql).digest("hex"),
    }));

    if (
      new Set(expected.map((migration) => migration.id)).size !== expected.length ||
      expected.some((migration, i) => i > 0 && migration.id <= expected[i - 1]!.id)
    )
      throw new AppError(ERROR_CODE.INVALID_MIGRATION_ORDER);

    if (
      applied.some(
        (migration, i) => migration.id !== expected[i]?.id || migration.hash !== expected[i]?.hash,
      )
    )
      throw new AppError(ERROR_CODE.MIGRATION_HISTORY_MISMATCH);

    const record = sqlite.prepare(
      "INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (?, ?, ?)",
    );

    for (let i = applied.length; i < migrations.length; i++) {
      sqlite.exec(migrations[i]!.sql);
      record.run(expected[i]!.id, expected[i]!.hash, Date.now());
    }

    if (
      applied.length < migrations.length &&
      sqlite.prepare("PRAGMA foreign_key_check").all().length
    )
      throw new AppError(ERROR_CODE.INVALID_FOREIGN_KEYS);

    sqlite.exec("COMMIT");
  } catch (error) {
    if (sqlite.isTransaction) sqlite.exec("ROLLBACK");
    throw error;
  } finally {
    sqlite.exec("PRAGMA foreign_keys = ON");
  }
}
