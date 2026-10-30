import { t } from "@shared/i18n";
import { GitError } from "@shared/errors";

export function missingIdentity(operation: string): GitError {
  return new GitError({
    kind: "invalid-input",
    operation,
    message: t("main.requestErrors.thatIdentityNoLongerExists"),
    suggestedAction: t("main.requestErrors.refreshTheIdentityListAndTryAgain"),
  });
}

export function invalidRequest(message: string): GitError {
  return new GitError({
    kind: "invalid-input",
    operation: t("operations.validateRequest"),
    message,
    suggestedAction: t("main.requestErrors.refreshTheRepositoryAndTryAgain"),
  });
}
