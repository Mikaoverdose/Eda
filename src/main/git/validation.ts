import { t } from "@shared/i18n";
import { isAbsolute } from "node:path";
import { GitError } from "@shared/errors";

const invalid = (operation: string, message: string, suggestedAction: string) =>
  new GitError({ kind: "invalid-input", operation, message, suggestedAction });

export function assertNotOptionLike(
  value: string,
  operation: string,
  label = t("fields.value"),
): void {
  if (value.startsWith("-")) {
    throw invalid(
      operation,
      t("main.git.validation.theStartsWithADashSoGitWouldReadItAsAnOption", {
        label: label,
        value: value,
      }),
      t("main.git.validation.renameTheSoItDoesNotBeginWith", { label: label }),
    );
  }
}

export function isValidRefName(ref: string): boolean {
  if (ref.length === 0 || ref.length > 255) return false;

  if (ref.startsWith("/") || ref.endsWith("/") || ref.includes("//")) return false;
  if (ref.startsWith(".") || ref.endsWith(".")) return false;
  if (ref.endsWith(".lock") || ref.includes(".lock/")) return false;
  if (ref.includes("..") || ref.includes("@{")) return false;
  if (ref === "@") return false;
  if (ref.endsWith("/")) return false;
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(ref)) return false;
  if (ref.split("/").some((part) => part.length === 0 || part.startsWith("."))) return false;

  return true;
}

export function assertValidRefName(ref: string, operation: string): void {
  if (!isValidRefName(ref)) {
    throw invalid(
      operation,
      t("main.git.validation.isNotAValidGitReferenceName", { ref: ref }),
      t("main.git.validation.referenceNamesCannotContainSpacesControlCharactersOr"),
    );
  }

  assertNotOptionLike(ref, operation, t("fields.referenceName"));
}

export function isValidObjectId(value: string): boolean {
  return /^[0-9a-f]{4,64}$/.test(value);
}

export function assertValidObjectId(value: string, operation: string): void {
  if (!isValidObjectId(value)) {
    throw invalid(
      operation,
      t("main.git.validation.isNotAValidGitObjectId", { value: value }),
      t("main.git.validation.objectIdsAreHexadecimalAndAtLeast4CharactersLong"),
    );
  }
}

export function assertFullObjectId(value: string, operation: string): void {
  if (!/^[0-9a-f]{40,64}$/.test(value)) {
    throw invalid(
      operation,
      t("main.git.validation.isNotAFullGitObjectId", { value: value }),
      t("main.git.validation.refreshHistoryAndSelectTheCommitAgain"),
    );
  }
}

export function assertAllowedRemoteUrl(value: string, operation: string): void {
  const remoteError = (message: string) =>
    invalid(operation, message, t("main.git.validation.checkTheRemoteUrlAndTryAgain"));

  if (!value || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value) || value.startsWith("-"))
    throw remoteError(t("main.git.validation.enterAnHttpssshOrAbsoluteLocalRepositoryUrl"));

  if (isAbsolute(value) && !value.includes("://")) return;
  if (/\s/.test(value)) throw remoteError(t("main.git.validation.encodeSpacesInRemoteUrLs"));
  if (/^[\w.-]+@[\w.-]+:[^:]+$/.test(value)) return;

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw remoteError(t("main.git.validation.useAnHttpsOrSshurlUserHostPathOrAnAbsoluteLocalPath"));
  }

  if (
    !["https:", "ssh:", "file:"].includes(url.protocol) ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol === "https:" && url.username)
  )
    throw remoteError(t("main.git.validation.useHttpssshOrFileUrLsWithoutEmbedded"));
}

// OpenSSH has no safe end-of-options marker for destinations.
export function parseValidSshDestination(
  destination: string,
  operation: string,
): { destination: string; port?: number } {
  const trimmed = destination.trim();

  if (trimmed.length === 0) {
    throw invalid(
      operation,
      t("main.git.validation.theHostIsEmpty"),
      t("main.git.validation.enterAHostSuchAsGithubComOrGitGithubCom"),
    );
  }

  if (trimmed.length > 320) {
    throw invalid(
      operation,
      t("main.git.validation.thatHostIsTooLong"),
      t("main.git.validation.checkTheAddressAndTryAgain"),
    );
  }

  assertNotOptionLike(trimmed, operation, t("fields.host"));

  const shape =
    /^(?:([A-Za-z0-9._-]+)@)?([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*)(?::(\d{1,5}))?$/;
  const match = shape.exec(trimmed);

  if (!match) {
    throw invalid(
      operation,
      t("main.git.validation.isNotAValidSshHost", { trimmed: trimmed }),
      t("main.git.validation.useAHostLikeGithubComOrGitGithubComToIncludeAUsername"),
    );
  }

  const port = match[3];

  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
    throw invalid(
      operation,
      t("main.git.validation.portIsOutOfRange", { port: port }),
      t("main.git.validation.useAPortBetween1And65535"),
    );
  }

  const user = match[1];
  const host = match[2]!;

  return { destination: user ? `${user}@${host}` : host, ...(port ? { port: Number(port) } : {}) };
}

export function assertValidSshDestination(destination: string, operation: string): void {
  parseValidSshDestination(destination, operation);
}

export function assertPlainPath(path: string, operation: string): void {
  if (path.length === 0) {
    throw invalid(
      operation,
      t("main.git.validation.theFilePathIsEmpty"),
      t("main.git.validation.selectAFile"),
    );
  }

  if (path.includes("\0")) {
    throw invalid(
      operation,
      t("main.git.validation.theFilePathContainsANullByte"),
      t("main.git.validation.chooseADifferentFile"),
    );
  }

  if (path.startsWith(":")) {
    throw invalid(
      operation,
      t("main.git.validation.thePathStartsWithWhichGitReadsAsAPathspecExpression", { path: path }),
      t("main.git.validation.renameTheFileSoItDoesNotBeginWith"),
    );
  }
}

export function assertRepositoryPath(path: string, operation: string): void {
  assertPlainPath(path, operation);

  if (path.length > 4096 || path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) {
    throw invalid(
      operation,
      t("main.git.validation.theFilePathMustBeRelativeToTheRepository"),
      t("main.git.validation.refreshTheFileListAndTryAgain"),
    );
  }

  if (path.split(/[\\/]/).some((part) => part === "..")) {
    throw invalid(
      operation,
      t("main.git.validation.theFilePathLeavesTheRepository"),
      t("main.git.validation.selectAFileInsideTheRepository"),
    );
  }
}
