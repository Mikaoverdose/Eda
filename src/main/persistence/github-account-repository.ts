import { eq } from "drizzle-orm";
import type { Database } from "./types";
import { githubAccounts } from "./schema";

export type SavedGitHubAccount = typeof githubAccounts.$inferSelect;

export class GitHubAccountRepository {
  constructor(private readonly db: Database) {}

  find(profileId: string): SavedGitHubAccount | undefined {
    return this.db
      .select()
      .from(githubAccounts)
      .where(eq(githubAccounts.profileId, profileId))
      .get();
  }

  save(account: SavedGitHubAccount): void {
    this.db
      .insert(githubAccounts)
      .values(account)
      .onConflictDoUpdate({ target: githubAccounts.profileId, set: account })
      .run();
  }

  delete(profileId: string): void {
    this.db.delete(githubAccounts).where(eq(githubAccounts.profileId, profileId)).run();
  }
}
