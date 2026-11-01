import { redactDiagnostic } from "./diagnostics";
import {
  ERROR_MESSAGE_KEYS,
  errorText,
  resolveErrorText,
  type ErrorCode,
  type ErrorText,
} from "./error-codes";
import { english } from "./i18n";
export const EXPECTED_KINDS = [
  "auth-failed",
  "github-auth-required",
  "github-access-required",
  "network-failed",
  "merge-conflict",
  "lock-contention",
  "dirty-working-tree",
  "non-fast-forward",
  "not-a-repository",
  "no-upstream",
  "nothing-to-commit",
  "identity-mismatch",
  "cancelled",
] as const;

export const UNEXPECTED_KINDS = [
  "git-not-found",
  "repository-corrupt",
  "config-write-refused",
  "keychain-unavailable",
  "invalid-input",
  "output-too-large",
  "unknown",
] as const;

export type ExpectedErrorKind = (typeof EXPECTED_KINDS)[number];

export type UnexpectedErrorKind = (typeof UNEXPECTED_KINDS)[number];

export type GitErrorKind = ExpectedErrorKind | UnexpectedErrorKind;

const EXPECTED_SET: ReadonlySet<string> = new Set(EXPECTED_KINDS);

export function isExpectedKind(kind: GitErrorKind): kind is ExpectedErrorKind {
  return EXPECTED_SET.has(kind);
}

export interface AppErrorData {
  code?: string;
  text?: ErrorText;
  action?: ErrorText | undefined;
  // Older IPC callers still read these strings. UI code should use errorMessage().
  message: string;
  suggestedAction?: string | undefined;
}

export class AppError extends Error {
  readonly code: string;
  readonly text: ErrorText;
  constructor(code: ErrorCode | ErrorText, stableCode?: string) {
    super();
    this.name = "AppError";
    const candidate = typeof code === "string" ? errorText(ERROR_MESSAGE_KEYS[code]) : code;
    const known = validText(candidate);
    this.text = sanitizeText(known ? candidate : errorText("errors.unexpected"));
    this.code = known
      ? (stableCode ?? (typeof code === "string" ? code : code.key))
      : this.text.key;
  }
  override get message(): string {
    return redactDiagnostic(resolveErrorText(this.text));
  }
}

export interface GitErrorData extends AppErrorData {
  kind: GitErrorKind;
  operation: string;
  repositoryPath?: string;
  exitCode?: number;
  rawStderr?: string;
}

interface GitErrorInput extends Omit<GitErrorData, "message" | "suggestedAction"> {
  message: ErrorText | string;
  suggestedAction?: ErrorText | string | undefined;
}

export class GitError extends AppError implements GitErrorData {
  readonly kind: GitErrorKind;
  readonly operation: string;
  readonly action: ErrorText | undefined;
  readonly repositoryPath?: string;
  readonly exitCode?: number;
  readonly rawStderr?: string;

  constructor(data: GitErrorInput) {
    // Old IPC payloads can lack a translation key; don't display their raw message.
    super(
      data.text ??
        (typeof data.message === "string" ? errorText("errors.unexpected") : data.message),
      data.code,
    );
    this.name = "GitError";
    this.kind = data.kind;
    this.operation = redactDiagnostic(data.operation);
    const action =
      data.action ?? (typeof data.suggestedAction === "string" ? undefined : data.suggestedAction);
    this.action = validText(action) ? sanitizeText(action) : undefined;
    if (data.repositoryPath !== undefined)
      this.repositoryPath = redactDiagnostic(data.repositoryPath);
    if (data.exitCode !== undefined) this.exitCode = data.exitCode;
    if (data.rawStderr !== undefined) this.rawStderr = redactDiagnostic(data.rawStderr);
  }
  get suggestedAction(): string | undefined {
    return this.action ? redactDiagnostic(resolveErrorText(this.action)) : undefined;
  }
  get isExpected(): boolean {
    return isExpectedKind(this.kind);
  }
  toData(): GitErrorData {
    return {
      code: this.code,
      text: sanitizeText(this.text),
      ...(this.action && { action: sanitizeText(this.action) }),
      kind: this.kind,
      operation: this.operation,
      message: this.message,
      ...(this.suggestedAction !== undefined && { suggestedAction: this.suggestedAction }),
      ...(this.repositoryPath !== undefined && { repositoryPath: this.repositoryPath }),
      ...(this.exitCode !== undefined && { exitCode: this.exitCode }),
    };
  }
}
function sanitizeText(text: ErrorText): ErrorText {
  return errorText(
    text.key,
    text.values &&
      Object.fromEntries(
        Object.entries(text.values).map(([key, value]) => [
          key,
          typeof value === "string" ? redactDiagnostic(value) : value,
        ]),
      ),
  );
}

// Use a localized fallback for unknown exceptions instead of showing their raw message.
export function errorMessage(
  error: unknown,
  fallback: ErrorText = errorText("errors.unexpected"),
): string {
  if (error instanceof AppError) return error.message;
  if (error && typeof error === "object" && "text" in error && validText(error.text))
    return redactDiagnostic(resolveErrorText(error.text));
  return resolveErrorText(fallback);
}
export function errorAction(error: unknown): string | undefined {
  if (error instanceof GitError) return error.suggestedAction;
  if (error && typeof error === "object" && "action" in error && validText(error.action))
    return redactDiagnostic(resolveErrorText(error.action));
  return undefined;
}
function validText(value: unknown): value is ErrorText {
  if (
    !value ||
    typeof value !== "object" ||
    !("key" in value) ||
    typeof value.key !== "string" ||
    !Object.hasOwn(english, value.key)
  )
    return false;
  if (!("values" in value) || value.values === undefined) return true;
  return (
    !!value.values &&
    typeof value.values === "object" &&
    !Array.isArray(value.values) &&
    Object.values(value.values).every(
      (entry) =>
        entry === null ||
        entry === undefined ||
        typeof entry === "string" ||
        typeof entry === "number",
    )
  );
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: GitErrorData };
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = (error: GitError | GitErrorInput): Result<never> => ({
  ok: false,
  error: error instanceof GitError ? error.toData() : new GitError(error).toData(),
});
