import { errorText } from "@shared/error-codes";
import { t } from "@shared/i18n";
import type { IdentityManager } from "../identity/identity-manager";
import { invalidRequest, missingIdentity } from "./request-errors";
import { requireId } from "./validate";

export function captureProfile(identity: IdentityManager, rawId?: unknown) {
  const active = identity.getActive();
  if (!active) throw missingIdentity(t("operations.profileOperation"));
  if (rawId !== undefined && requireId(rawId) !== active.id)
    throw invalidRequest(
      errorText("main.profileContext.theProfileChangedBeforeThisActionCouldStart"),
    );
  return active;
}
