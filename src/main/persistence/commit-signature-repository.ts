import type { CommitSignatureVerification } from "@shared/repository/repository-read";
import { isOneOf, isRecord } from "@shared/validation";
import { and, eq } from "drizzle-orm";
import { commitSignatures, repositories } from "./schema";
import type { Database } from "./types";

export class CommitSignatureRepository {
  constructor(private readonly db: Database) {}

  read(profileId: string, repositoryId: string, oid: string): CommitSignatureVerification | null {
    const row = this.db
      .select()
      .from(commitSignatures)
      .where(
        and(
          eq(commitSignatures.profileId, profileId),
          eq(commitSignatures.repositoryId, repositoryId),
          eq(commitSignatures.oid, oid),
        ),
      )
      .get();

    if (!row || row.version !== 1) return null;

    let value: unknown;

    try {
      value = JSON.parse(row.value);
    } catch {
      return null;
    }

    return isSignature(value) ? value : null;
  }

  record(
    profileId: string,
    repositoryId: string,
    oid: string,
    signature: CommitSignatureVerification,
  ): void {
    const owner = this.db
      .select({ id: repositories.id })
      .from(repositories)
      .where(and(eq(repositories.identityId, profileId), eq(repositories.id, repositoryId)))
      .get();

    if (!owner) return;

    const value = JSON.stringify(signature);

    this.db
      .insert(commitSignatures)
      .values({ profileId, repositoryId, oid, version: 1, value })
      .onConflictDoUpdate({
        target: [commitSignatures.profileId, commitSignatures.repositoryId, commitSignatures.oid],
        set: { value, version: 1 },
      })
      .run();
  }
}

function isSignature(value: unknown): value is CommitSignatureVerification {
  if (!isRecord(value)) return false;

  return (
    isOneOf(value["status"], ["verified", "invalid", "unverified", "unsigned"]) &&
    (value["format"] === null || isOneOf(value["format"], ["openpgp", "ssh", "x509", "unknown"])) &&
    (value["reasonCode"] === null ||
      isOneOf(value["reasonCode"], [
        "bad-signature",
        "missing-key",
        "missing-trust",
        "untrusted-key",
        "expired-signature",
        "expired-key",
        "revoked-key",
        "verification-error",
        "unsupported-format",
      ])) &&
    typeof value["diagnostics"] === "string" &&
    ["signer", "keyId", "fingerprint", "primaryFingerprint"].every(
      (key) => value[key] === undefined || typeof value[key] === "string",
    ) &&
    (value["trustLevel"] === undefined ||
      isOneOf(value["trustLevel"], ["undefined", "never", "marginal", "fully", "ultimate"]))
  );
}
