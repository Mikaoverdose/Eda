import { DatabaseSync } from "node:sqlite";
import { closeSync, constants, fchmodSync, mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-sqlite";
import { appState } from "./schema";
import type { Database } from "./types";
import { applyMigrations } from "./migrate";

const MIGRATIONS = import.meta.glob("./migrations/*/migration.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function openDatabase(path: string): Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const fd = openSync(
      path,
      constants.O_CREAT | constants.O_RDWR | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      if (process.platform !== "win32") fchmodSync(fd, 0o600);
    } finally {
      closeSync(fd);
    }
  }

  const sqlite = new DatabaseSync(path);

  try {
    sqlite.exec("PRAGMA busy_timeout = 5000");
    if (path !== ":memory:") sqlite.exec("PRAGMA journal_mode = WAL");

    applyMigrations(
      sqlite,
      Object.keys(MIGRATIONS)
        .sort()
        .map((name) => ({
          id: name.split("/").at(-2)!,
          sql: MIGRATIONS[name]!,
        })),
      path === ":memory:" ? {} : { backupPath: `${path}.backup-${Date.now()}-${randomUUID()}` },
    );

    const db = drizzle({ client: sqlite });
    db.insert(appState).values({ id: 1 }).onConflictDoNothing().run();

    return Object.assign(db, {
      close: () => sqlite.close(),
      raw: sqlite,
    });
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

export function openInMemoryDatabase(): Database {
  return openDatabase(":memory:");
}
