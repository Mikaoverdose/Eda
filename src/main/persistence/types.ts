import type { DatabaseSync } from "node:sqlite";
import type { drizzle } from "drizzle-orm/node-sqlite";

export type Database = ReturnType<typeof drizzle> & {
  close: () => void;
  raw: DatabaseSync;
};
