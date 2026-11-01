import { errorText } from "@shared/error-codes";
import { t } from "@shared/i18n";
import { GitError } from "../errors";

export interface AccountOwner {
  profileId: string;
  provider: string;
  host: string;
  accountId: string;
}

export function accountOwnerKey(owner: AccountOwner): string {
  const host = owner.host.trim().toLowerCase().replace(/\.$/, "");

  if (
    ![owner.profileId, owner.provider, owner.accountId].every(
      (v) => typeof v === "string" && v.length > 0 && v.length <= 1024 && !/[\0\r\n]/.test(v),
    ) ||
    !/^[a-z0-9.-]+(?::\d+)?$/.test(host)
  ) {
    throw new GitError({
      kind: "invalid-input",
      operation: t("operations.accountOwnership"),
      message: errorText("shared.accounts.invalidProfileHostOrAccountOwner"),
    });
  }

  return JSON.stringify([owner.profileId, owner.provider, host, owner.accountId]);
}

export function accountCacheKey(owner: AccountOwner, query: string): string {
  return JSON.stringify([accountOwnerKey(owner), query]);
}
