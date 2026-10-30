import type { Database } from "../persistence/types";

export function clearDatabase(db: Database): void {
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
