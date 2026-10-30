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

export interface GitErrorData {
  kind: GitErrorKind;
  operation: string;
  message: string;
  suggestedAction?: string;
  repositoryPath?: string;
  exitCode?: number;
  rawStderr?: string;
}

export class GitError extends Error implements GitErrorData {
  readonly kind: GitErrorKind;
  readonly operation: string;
  readonly suggestedAction?: string;
  readonly repositoryPath?: string;
  readonly exitCode?: number;
  readonly rawStderr?: string;

  constructor(data: GitErrorData) {
    super(redactDiagnostic(data.message));
    this.name = "GitError";
    this.kind = data.kind;
    this.operation = redactDiagnostic(data.operation);

    if (data.suggestedAction !== undefined)
      this.suggestedAction = redactDiagnostic(data.suggestedAction);
    if (data.repositoryPath !== undefined)
      this.repositoryPath = redactDiagnostic(data.repositoryPath);
    if (data.exitCode !== undefined) this.exitCode = data.exitCode;
    if (data.rawStderr !== undefined) this.rawStderr = redactDiagnostic(data.rawStderr);
  }

  get isExpected(): boolean {
    return isExpectedKind(this.kind);
  }

  toData(): GitErrorData {
    return {
      kind: this.kind,
      operation: this.operation,
      message: this.message,
      ...(this.suggestedAction !== undefined && { suggestedAction: this.suggestedAction }),
      ...(this.repositoryPath !== undefined && { repositoryPath: this.repositoryPath }),
      ...(this.exitCode !== undefined && { exitCode: this.exitCode }),
    };
  }
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: GitErrorData };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = (error: GitError | GitErrorData): Result<never> => ({
  ok: false,
  error: error instanceof GitError ? error.toData() : new GitError(error).toData(),
});
import { redactDiagnostic } from "./diagnostics";
