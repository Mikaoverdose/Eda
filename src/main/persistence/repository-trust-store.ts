import { eq } from "drizzle-orm";
import { repositoryTrust } from "./schema";
import type { Database } from "./types";

export class RepositoryTrustStore {
  constructor(private readonly db: Database) {}

  matches(path: string, fingerprint: string): boolean {
    return (
      this.db.select().from(repositoryTrust).where(eq(repositoryTrust.path, path)).get()
        ?.fingerprint === fingerprint
    );
  }

  remember(path: string, fingerprint: string): void {
    this.db
      .insert(repositoryTrust)
      .values({ path, fingerprint })
      .onConflictDoUpdate({ target: repositoryTrust.path, set: { fingerprint } })
      .run();
  }
}
