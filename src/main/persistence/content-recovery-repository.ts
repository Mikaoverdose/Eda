import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { RecoverySummary } from "@shared/workflows/recovery";
import type { Database } from "./types";
import { contentRecovery } from "./schema";

export interface SavedFile {
  path: string;
  content: string | null;
  mode: number;
  hash: string;
  tracked: boolean;
}

export interface ContentRecoveryRecord extends RecoverySummary {
  savedIndex?: { path: string; stage: number; mode: string; content: string }[];
  profileId: string;
  repositoryId: string;
  root: string;
  files: SavedFile[];
  after?: Record<string, string>;
}

export class ContentRecoveryRepository {
  constructor(private readonly db: Database) {}

  remove(profileId: string, repositoryId: string, id: string): void {
    this.db
      .delete(contentRecovery)
      .where(
        and(
          eq(contentRecovery.profileId, profileId),
          eq(contentRecovery.repositoryId, repositoryId),
          eq(contentRecovery.id, id),
        ),
      )
      .run();
  }

  save(record: ContentRecoveryRecord): void {
    const value = {
      version: 1,
      id: record.id,
      profileId: record.profileId,
      repositoryId: record.repositoryId,
      createdAt: record.createdAt,
      value: JSON.stringify(record),
    };

    this.db
      .insert(contentRecovery)
      .values(value)
      .onConflictDoUpdate({ target: contentRecovery.id, set: value })
      .run();
  }

  get(profileId: string, repositoryId: string, id: string): ContentRecoveryRecord | undefined {
    const row = this.db
      .select()
      .from(contentRecovery)
      .where(
        and(
          eq(contentRecovery.profileId, profileId),
          eq(contentRecovery.repositoryId, repositoryId),
          eq(contentRecovery.id, id),
        ),
      )
      .get();

    if (!row || row.version !== 1) return undefined;
    try {
      const record = JSON.parse(row.value) as ContentRecoveryRecord;
      return record &&
        record.id === row.id &&
        record.profileId === row.profileId &&
        record.repositoryId === row.repositoryId &&
        typeof record.root === "string" &&
        Array.isArray(record.files)
        ? record
        : undefined;
    } catch {
      return undefined;
    }
  }

  list(profileId: string, repositoryId: string): RecoverySummary[] {
    return this.db
      .select({
        id: contentRecovery.id,
        createdAt: contentRecovery.createdAt,
        value: sql<string>`CASE WHEN json_valid(${contentRecovery.value}) THEN json_remove(${contentRecovery.value}, '$.files', '$.savedIndex', '$.after', '$.root', '$.profileId', '$.repositoryId') ELSE NULL END`,
      })
      .from(contentRecovery)
      .where(
        and(
          eq(contentRecovery.profileId, profileId),
          eq(contentRecovery.repositoryId, repositoryId),
          eq(contentRecovery.version, 1),
        ),
      )
      .orderBy(desc(contentRecovery.createdAt))
      .all()
      .flatMap((row) => {
        try {
          const record = JSON.parse(row.value) as RecoverySummary;
          return record &&
            record.id === row.id &&
            record.createdAt === row.createdAt &&
            Array.isArray(record.paths) &&
            ["prepared", "completed", "restored"].includes(record.state) &&
            Number.isFinite(record.bytes) &&
            record.bytes >= 0
            ? [record]
            : [];
        } catch {
          return [];
        }
      });
  }

  prune(profileId: string, repositoryId: string) {
    let bytes = 0;
    const expired = this.list(profileId, repositoryId)
      .filter((record, index) => {
        bytes += record.bytes;

        return (
          record.state !== "prepared" &&
          (index >= 100 ||
            bytes > 256 * 1024 * 1024 ||
            Date.parse(record.createdAt) < Date.now() - 30 * 86400_000)
        );
      })
      .map((record) => record.id);

    if (expired.length)
      this.db
        .delete(contentRecovery)
        .where(
          and(
            eq(contentRecovery.profileId, profileId),
            eq(contentRecovery.repositoryId, repositoryId),
            inArray(contentRecovery.id, expired),
          ),
        )
        .run();
  }
}
