import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { repositories } from "./schema";
import type { Database } from "./types";

export class RepositoryMemberships {
  constructor(private readonly db: Database) {}

  list(profileId: string) {
    return this.db
      .select()
      .from(repositories)
      .where(eq(repositories.identityId, profileId))
      .orderBy(desc(repositories.favourite), sql`${repositories.name} COLLATE NOCASE`)
      .all();
  }

  find(id: string, profileId: string) {
    return this.db
      .select()
      .from(repositories)
      .where(and(eq(repositories.id, id), eq(repositories.identityId, profileId)))
      .get();
  }

  remove(id: string, profileId: string): void {
    this.db
      .delete(repositories)
      .where(and(eq(repositories.id, id), eq(repositories.identityId, profileId)))
      .run();
  }

  relocate(id: string, path: string, name: string): void {
    this.db.update(repositories).set({ path, name }).where(eq(repositories.id, id)).run();
  }

  updateMetadata(id: string, name: string, favourite: boolean): void {
    this.db
      .update(repositories)
      .set({ name, favourite: favourite ? 1 : 0 })
      .where(eq(repositories.id, id))
      .run();
  }

  register(path: string, profileId: string) {
    const existing = this.db
      .select()
      .from(repositories)
      .where(and(eq(repositories.identityId, profileId), eq(repositories.path, path)))
      .get();
    const now = new Date().toISOString();

    if (existing) {
      this.db
        .update(repositories)
        .set({ lastOpenedAt: now })
        .where(eq(repositories.id, existing.id))
        .run();
      return { ...existing, lastOpenedAt: now };
    }

    const row = {
      id: randomUUID(),
      identityId: profileId,
      name: basename(path),
      path,
      favourite: 0,
      lastOpenedAt: now,
      createdAt: now,
    };

    this.db.insert(repositories).values(row).run();
    return row;
  }
}
