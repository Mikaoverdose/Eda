import { readdirSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Database } from "./types";

export function clearDatabase(db: Database): void {
  const path = db.raw.location();
  if (path) {
    for (const file of readdirSync(dirname(path), { withFileTypes: true })) {
      if (file.isFile() && isDatabaseBackup(file.name, basename(path)))
        unlinkSync(join(dirname(path), file.name));
    }
  }

  const tables = db.raw
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
    )
    .all() as { name: string }[];
  db.raw.exec("PRAGMA foreign_keys = OFF");
  try {
    db.raw.exec("BEGIN");
    try {
      for (const { name } of tables) db.raw.exec(`DELETE FROM "${name.replaceAll('"', '""')}"`);
      db.raw.exec("INSERT INTO app_state (id) VALUES (1)");
      db.raw.exec("COMMIT");
    } catch (error) {
      db.raw.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.raw.exec("PRAGMA foreign_keys = ON");
  }
  db.raw.exec("VACUUM");
  db.raw.exec("PRAGMA wal_checkpoint(TRUNCATE)");
}

export function clearStartupData(userDataPath: string): void {
  const files = new Set(["eda.db", "eda.db-wal", "eda.db-shm", "eda.db-journal", "secrets.vault"]);
  for (const file of readdirSync(userDataPath, { withFileTypes: true })) {
    if (
      (file.isFile() || file.isSymbolicLink()) &&
      (files.has(file.name) || isDatabaseBackup(file.name, "eda.db"))
    )
      unlinkSync(join(userDataPath, file.name));
  }
}

function isDatabaseBackup(name: string, databaseName: string): boolean {
  const prefix = databaseName + ".backup-";
  return (
    name.startsWith(prefix) &&
    /^\d+-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(name.slice(prefix.length))
  );
}
