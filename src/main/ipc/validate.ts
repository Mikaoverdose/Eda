import { t } from "@shared/i18n";
import { GitError } from "@shared/errors";

function reject(message: string, suggestedAction: string): never {
  throw new GitError({
    kind: "invalid-input",
    operation: t("operations.validateRequest"),
    message,
    suggestedAction,
  });
}

export function requireString(value: unknown, field: string, maxLength = 4096): string {
  if (typeof value !== "string") {
    reject(
      t("main.validate.mustBeText", { field: field }),
      t("main.validate.thisIsABugInEdaPleaseReportIt"),
    );
  }

  const text = value;

  if (text.length === 0) {
    reject(
      t("main.validate.isRequired", { field: field }),
      t("main.validate.enterAValueFor", { field: field }),
    );
  }

  if (text.length > maxLength) {
    reject(
      t("main.validate.isTooLong", { field: field }),
      t("main.validate.useCharactersOrFewer", { maxLength: maxLength }),
    );
  }

  if (text.includes("\0")) {
    reject(
      t("main.validate.containsANullByte", { field: field }),
      t("main.validate.removeTheInvalidCharacter"),
    );
  }

  return text;
}

export function requireId(value: unknown, field = "id"): string {
  const text = requireString(value, field, 64);
  if (!/^[0-9a-f-]{36}$/i.test(text)) {
    reject(
      t("main.validate.isNotAValidIdentifier", { field: field }),
      t("main.validate.thisIsABugInEdaPleaseReportIt"),
    );
  }
  return text;
}

export function requireAbsolutePath(value: unknown, field = "path"): string {
  const text = requireString(value, field);
  const isAbsolute = text.startsWith("/") || /^[A-Za-z]:[\\/]/.test(text);
  if (!isAbsolute) {
    reject(
      t("main.validate.mustBeAFullPath", { field: field }),
      t("main.validate.chooseAFolderUsingTheFolderPicker"),
    );
  }
  return text;
}

export function requireEmail(value: unknown, field = "email"): string {
  const text = requireString(value, field, 320);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    reject(
      t("main.validate.thatDoesNotLookLikeAnEmailAddress"),
      t("main.validate.enterAnAddressLikeYouExampleCom"),
    );
  }
  return text;
}

export function requireHue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    reject(
      t("main.validate.theIdentityColorIsInvalid"),
      t("main.validate.pickAColorForThisIdentity"),
    );
  }
  return ((value % 360) + 360) % 360;
}

export function optionalString(
  value: unknown,
  field: string,
  maxLength = 4096,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireString(value, field, maxLength);
}

export function requireStringArray(value: unknown, field: string, maxItems = 100): string[] {
  if (!Array.isArray(value)) {
    reject(
      t("main.validate.mustBeAList", { field: field }),
      t("main.validate.thisIsABugInEdaPleaseReportIt"),
    );
  }

  const items: unknown[] = value;

  if (items.length > maxItems) {
    reject(
      t("main.validate.hasTooManyEntries", { field: field }),
      t("main.validate.useOrFewer", { maxItems: maxItems }),
    );
  }

  return items.map((item, i) => requireString(item, `${field}[${i}]`));
}

export function optionalInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;

  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    reject(
      t("main.validate.isOutsideTheSupportedRange", { field: field }),
      t("main.validate.useAWholeNumberFromTo", { minimum: minimum, maximum: maximum }),
    );
  }

  return value as number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    reject(
      t("main.validate.isInvalid", { label: label }),
      t("main.validate.refreshTheRepositoryAndTryAgain"),
    );
  }
  return value;
}

export function optionalRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
