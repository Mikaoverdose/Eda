import { errorText } from "@shared/error-codes";
import { GitError, type GitErrorData } from "@shared/errors";

export function errorFixture(
  data: Pick<GitErrorData, "message"> & Partial<GitErrorData>,
): GitErrorData {
  const error = new GitError({
    ...data,
    kind: data.kind ?? "unknown",
    operation: data.operation ?? "fixture",
    message: errorText("errors.operationBlocked", { reason: data.message }),
    ...(data.suggestedAction === undefined
      ? {}
      : {
          suggestedAction: errorText("errors.operationBlocked", { reason: data.suggestedAction }),
        }),
  });
  // Some main-process tests inspect stderr. err() removes it before it reaches the UI.
  return {
    ...error.toData(),
    ...(data.rawStderr === undefined ? {} : { rawStderr: data.rawStderr }),
  };
}
