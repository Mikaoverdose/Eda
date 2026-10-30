import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FetchHistory } from "@shared/integrations/background-fetch";
import { redactDiagnostic } from "@shared/diagnostics";
import type { Database } from "./types";
import { fetchHistory, repositories } from "./schema";

export class FetchHistoryRepository {
  constructor(private readonly db: Database) {}

  read(profileId: string, repositoryId: string, remote: string, url: string): FetchHistory | null {
    const row = this.db
      .select()
      .from(fetchHistory)
      .where(
        and(
          eq(fetchHistory.profileId, profileId),
          eq(fetchHistory.repositoryId, repositoryId),
          eq(fetchHistory.remote, remote),
          eq(fetchHistory.urlHash, urlHash(url)),
        ),
      )
      .get();

    if (!row || row.version !== 1) return null;

    try {
      const value = JSON.parse(row.value) as FetchHistory;

      if (
        Number.isFinite(value.lastAttempt) &&
        Number.isInteger(value.failures) &&
        value.failures >= 0 &&
        (value.lastSuccess === null || Number.isFinite(value.lastSuccess)) &&
        (value.retryAt === null || Number.isFinite(value.retryAt)) &&
        (value.error === null || typeof value.error === "string")
      )
        return value;
    } catch {}

    return null;
  }

  record(
    profileId: string,
    repositoryId: string,
    remote: string,
    url: string,
    now: number,
    error: string | null,
  ): void {
    if (
      !this.db
        .select({ id: repositories.id })
        .from(repositories)
        .where(and(eq(repositories.id, repositoryId), eq(repositories.identityId, profileId)))
        .get()
    )
      return;

    const previous = this.read(profileId, repositoryId, remote, url);
    const failures = error === null ? 0 : Math.min(20, (previous?.failures ?? 0) + 1);
    const value: FetchHistory = {
      lastAttempt: now,
      lastSuccess: error === null ? now : (previous?.lastSuccess ?? null),
      failures,
      retryAt: error === null ? null : now + Math.min(3600_000, 60_000 * 2 ** (failures - 1)),
      error: error === null ? null : redactDiagnostic(error).slice(0, 2000),
    };

    const row = {
      remote,
      urlHash: urlHash(url),
      version: 1,
      profileId,
      repositoryId,
      value: JSON.stringify(value),
    };

    this.db
      .insert(fetchHistory)
      .values(row)
      .onConflictDoUpdate({
        target: [
          fetchHistory.profileId,
          fetchHistory.repositoryId,
          fetchHistory.remote,
          fetchHistory.urlHash,
        ],
        set: { value: row.value, version: 1 },
      })
      .run();
  }
}

function urlHash(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}
