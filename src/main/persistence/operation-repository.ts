import { t } from "@shared/i18n";
import { desc, eq, inArray } from "drizzle-orm";
import type { OperationRecord } from "@shared/operations";
import type { Database } from "./types";
import { identities, operations } from "./schema";

function decode(row: typeof operations.$inferSelect): OperationRecord {
  try {
    const value = JSON.parse(row.record) as OperationRecord;

    if (
      row.version === 1 &&
      value &&
      value.id === row.id &&
      value.profileId === row.profileId &&
      ["queued", "running", "succeeded", "failed", "interrupted"].includes(value.state) &&
      [
        "repositoryId",
        "repositoryName",
        "kind",
        "startedAt",
        "updatedAt",
        "output",
        "message",
      ].every((key) => typeof (value as unknown as Record<string, unknown>)[key] === "string") &&
      typeof value.durationMs === "number" &&
      typeof value.cancellable === "boolean" &&
      typeof value.retryable === "boolean"
    )
      return value;
  } catch {}

  return {
    id: row.id,
    profileId: row.profileId,
    repositoryId: "",
    repositoryName: t("main.persistence.operationRepository.unavailableRepository"),
    kind: t("main.persistence.operationRepository.damagedRecord"),
    state: "interrupted",
    startedAt: row.updatedAt,
    updatedAt: row.updatedAt,
    durationMs: 0,
    output: "",
    message: t("main.persistence.operationRepository.thisActivityRecordCouldNotBeRead"),
    recovery: t("main.persistence.operationRepository.theOriginalRecordIsRetainedInTheLocal"),
    cancellable: false,
    retryable: false,
  };
}

export class OperationRepository {
  constructor(private readonly db: Database) {}

  save(record: OperationRecord): void {
    if (
      !this.db
        .select({ id: identities.id })
        .from(identities)
        .where(eq(identities.id, record.profileId))
        .get()
    )
      return;

    const value = {
      version: 1,
      id: record.id,
      profileId: record.profileId,
      updatedAt: record.updatedAt,
      record: JSON.stringify(record),
    };

    this.db
      .insert(operations)
      .values(value)
      .onConflictDoUpdate({ target: operations.id, set: value })
      .run();
  }

  list(profileId: string): OperationRecord[] {
    return this.db
      .select()
      .from(operations)
      .where(eq(operations.profileId, profileId))
      .orderBy(desc(operations.updatedAt))
      .limit(200)
      .all()
      .map(decode);
  }

  recover(): void {
    for (const row of this.db.select().from(operations).all()) {
      const record = decode(row);

      if (record.state === "queued" || record.state === "running")
        this.save({
          ...record,
          state: "interrupted",
          cancellable: false,
          retryable: false,
          message: t("main.persistence.operationRepository.edaClosedBeforeThisOperationFinished"),
          recovery: t(
            "main.persistence.operationRepository.refreshThisRepositoryAndInspectItsStatusBefore",
          ),
          updatedAt: new Date().toISOString(),
        });
      else if (record.retryable || record.cancellable)
        this.save({ ...record, retryable: false, cancellable: false });
    }
  }

  prune(profileId: string): void {
    const rows = this.db
      .select()
      .from(operations)
      .where(eq(operations.profileId, profileId))
      .orderBy(desc(operations.updatedAt))
      .all();

    const expired = rows
      .filter((row, index) => {
        if (row.version !== 1) return false;
        const record = decode(row);
        return (
          record.state !== "queued" &&
          record.state !== "running" &&
          (index >= 200 || Date.parse(record.updatedAt) < Date.now() - 30 * 86400_000)
        );
      })
      .map((row) => row.id);

    if (expired.length) this.db.delete(operations).where(inArray(operations.id, expired)).run();
  }
}
