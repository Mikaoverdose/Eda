import repositoryTrustSql from "@main/persistence/migrations/20261107000000_repository-trust/migration.sql?raw";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { applyMigrations, type Migration } from "@main/persistence/migrate";

const databases: DatabaseSync[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

const initial: Migration = {
  id: "001_initial",
  sql: `CREATE TABLE parents (id TEXT PRIMARY KEY NOT NULL);
        CREATE TABLE children (id TEXT PRIMARY KEY NOT NULL, parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE);
        INSERT INTO parents VALUES ('parent');
        INSERT INTO children VALUES ('child', 'parent');`,
};

function setup() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  applyMigrations(db, [initial]);
  return db;
}

it("backs up the pre-upgrade database, including WAL data, without overwriting the backup", () => {
  const directory = mkdtempSync(join(tmpdir(), "eda-migration-backup-"));
  const db = new DatabaseSync(join(directory, "eda.db"));
  const backupPath = join(directory, "before-upgrade.db");
  try {
    db.exec("PRAGMA journal_mode = WAL");
    applyMigrations(db, [initial]);
    db.exec("INSERT INTO parents VALUES ('in-wal')");
    const next = { id: "002_upgrade", sql: "ALTER TABLE parents ADD COLUMN name TEXT" };
    applyMigrations(db, [initial, next], { backupPath });
    if (process.platform !== "win32") expect(statSync(backupPath).mode & 0o077).toBe(0);
    const backup = new DatabaseSync(backupPath, { readOnly: true });
    try {
      expect(backup.prepare("SELECT * FROM parents ORDER BY id").all()).toEqual([
        { id: "in-wal" },
        { id: "parent" },
      ]);
      expect(backup.prepare("SELECT id FROM __drizzle_migrations").all()).toEqual([
        { id: initial.id },
      ]);
    } finally {
      backup.close();
    }
    expect(() =>
      applyMigrations(db, [initial, next, { id: "003_more", sql: "SELECT 1" }], { backupPath }),
    ).toThrow();
    expect(db.prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations").get()).toEqual({
      count: 2,
    });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it("rebuilds a parent table without cascading deletion into its children", () => {
  const db = setup();
  const rebuild: Migration = {
    id: "002_rebuild",
    sql: `CREATE TABLE parents_new (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL DEFAULT 'new');
          INSERT INTO parents_new (id) SELECT id FROM parents;
          DROP TABLE parents;
          ALTER TABLE parents_new RENAME TO parents;`,
  };
  applyMigrations(db, [initial, rebuild]);
  applyMigrations(db, [initial, rebuild]);
  expect(db.prepare("SELECT * FROM children").all()).toEqual([
    { id: "child", parent_id: "parent" },
  ]);
  expect(db.prepare("SELECT * FROM parents").all()).toEqual([{ id: "parent", name: "new" }]);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
  expect(
    db
      .prepare("SELECT id, length(hash) AS hash_length FROM __drizzle_migrations ORDER BY id")
      .all(),
  ).toEqual([
    { id: initial.id, hash_length: 64 },
    { id: rebuild.id, hash_length: 64 },
  ]);
});

it.each([
  ["invalid foreign keys", "DELETE FROM parents;"],
  ["SQL failures", "CREATE TABLE temporary_table (id TEXT); INSERT INTO missing_table VALUES (1);"],
])(
  "rolls back the entire pending batch on %s and restores foreign key enforcement",
  (_name, sql) => {
    const db = setup();
    expect(() =>
      applyMigrations(db, [
        initial,
        { id: "002_pending", sql: "CREATE TABLE pending_table (id TEXT);" },
        { id: "003_failure", sql },
      ]),
    ).toThrow();
    expect(db.prepare("SELECT * FROM children").all()).toEqual([
      { id: "child", parent_id: "parent" },
    ]);
    expect(db.prepare("SELECT * FROM parents").all()).toEqual([{ id: "parent" }]);
    expect(db.prepare("SELECT id FROM __drizzle_migrations").all()).toEqual([{ id: initial.id }]);
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_schema WHERE name IN ('pending_table', 'temporary_table')",
        )
        .all(),
    ).toEqual([]);
    expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    expect(db.isTransaction).toBe(false);
  },
);

it.each([
  ["edited SQL", [{ ...initial, sql: initial.sql + "\n-- changed" }]],
  ["unknown migrations", []],
  ["a missing earlier migration", [{ id: "000_inserted", sql: "SELECT 1" }, initial]],
])("refuses %s without modifying existing data", (_name, migrations) => {
  const db = setup();
  expect(() => applyMigrations(db, migrations)).toThrow(/history does not match/);
  expect(db.prepare("SELECT * FROM parents").all()).toEqual([{ id: "parent" }]);
  expect(db.prepare("SELECT id FROM __drizzle_migrations").all()).toEqual([{ id: initial.id }]);
  expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
});

it("rejects duplicate or unordered migration IDs", () => {
  const db = setup();
  expect(() => applyMigrations(db, [initial, initial])).toThrow(/unique and ordered/);
  expect(() => applyMigrations(db, [{ id: "002_later", sql: "SELECT 1" }, initial])).toThrow(
    /unique and ordered/,
  );
});

it("opens the earlier repository trust schema while rejecting other edits to the same migration", () => {
  const db = setup();
  const id = "20261107000000_repository-trust";
  const earlierSql =
    "CREATE TABLE repository_trust (\n  path TEXT PRIMARY KEY NOT NULL,\n  fingerprint TEXT NOT NULL\n);\n";
  applyMigrations(db, [initial, { id, sql: earlierSql }]);
  db.exec("INSERT INTO repository_trust VALUES ('/fixture', 'saved')");

  applyMigrations(db, [initial, { id, sql: repositoryTrustSql }]);
  expect(
    db.prepare("SELECT fingerprint FROM repository_trust WHERE path = '/fixture'").get(),
  ).toEqual({
    fingerprint: "saved",
  });
  expect(() =>
    applyMigrations(db, [initial, { id, sql: repositoryTrustSql + "\nSELECT 1;" }]),
  ).toThrow(/history does not match/);
});
