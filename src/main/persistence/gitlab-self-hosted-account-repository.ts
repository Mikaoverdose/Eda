import { and, eq } from "drizzle-orm";
import type { Database } from "./types";
import { gitlabSelfHostedAccounts } from "./schema";

export type SavedGitLabSelfHostedAccount = typeof gitlabSelfHostedAccounts.$inferSelect;

export class GitLabSelfHostedAccountRepository {
  constructor(private readonly db: Database) {}

  list(profileId: string): SavedGitLabSelfHostedAccount[] {
    return this.db
      .select()
      .from(gitlabSelfHostedAccounts)
      .where(eq(gitlabSelfHostedAccounts.profileId, profileId))
      .orderBy(gitlabSelfHostedAccounts.baseUrl)
      .all();
  }

  find(profileId: string, baseUrl: string): SavedGitLabSelfHostedAccount | undefined {
    return this.db
      .select()
      .from(gitlabSelfHostedAccounts)
      .where(
        and(
          eq(gitlabSelfHostedAccounts.profileId, profileId),
          eq(gitlabSelfHostedAccounts.baseUrl, baseUrl),
        ),
      )
      .get();
  }

  save(account: SavedGitLabSelfHostedAccount): void {
    this.db
      .insert(gitlabSelfHostedAccounts)
      .values(account)
      .onConflictDoUpdate({
        target: [gitlabSelfHostedAccounts.profileId, gitlabSelfHostedAccounts.baseUrl],
        set: account,
      })
      .run();
  }

  delete(profileId: string, baseUrl: string): void {
    this.db
      .delete(gitlabSelfHostedAccounts)
      .where(
        and(
          eq(gitlabSelfHostedAccounts.profileId, profileId),
          eq(gitlabSelfHostedAccounts.baseUrl, baseUrl),
        ),
      )
      .run();
  }
}
