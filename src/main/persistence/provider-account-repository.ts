import { eq } from "drizzle-orm";
import type { Database } from "./types";
import { githubAccounts, gitlabAccounts } from "./schema";

export type SavedProviderAccount = typeof githubAccounts.$inferSelect;

export class ProviderAccountRepository {
  private readonly table: typeof githubAccounts | typeof gitlabAccounts;

  constructor(
    private readonly db: Database,
    provider: "github" | "gitlab",
  ) {
    this.table = provider === "github" ? githubAccounts : gitlabAccounts;
  }

  find(profileId: string): SavedProviderAccount | undefined {
    return this.db.select().from(this.table).where(eq(this.table.profileId, profileId)).get();
  }

  save(account: SavedProviderAccount): void {
    this.db
      .insert(this.table)
      .values(account)
      .onConflictDoUpdate({ target: this.table.profileId, set: account })
      .run();
  }

  delete(profileId: string): void {
    this.db.delete(this.table).where(eq(this.table.profileId, profileId)).run();
  }
}
