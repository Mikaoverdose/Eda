import { eq } from "drizzle-orm";
import type { Database } from "./types";
import { gitlabAccounts } from "./schema";

export type SavedGitLabAccount = typeof gitlabAccounts.$inferSelect;

export class GitLabAccountRepository {
  constructor(private readonly db: Database) {}

  find(profileId: string): SavedGitLabAccount | undefined {
    return this.db
      .select()
      .from(gitlabAccounts)
      .where(eq(gitlabAccounts.profileId, profileId))
      .get();
  }

  save(account: SavedGitLabAccount): void {
    this.db
      .insert(gitlabAccounts)
      .values(account)
      .onConflictDoUpdate({ target: gitlabAccounts.profileId, set: account })
      .run();
  }

  delete(profileId: string): void {
    this.db.delete(gitlabAccounts).where(eq(gitlabAccounts.profileId, profileId)).run();
  }
}
