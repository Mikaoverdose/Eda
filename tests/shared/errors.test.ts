import { describe, expect, it } from "vitest";
import { EXPECTED_KINDS, GitError, UNEXPECTED_KINDS, err, isExpectedKind } from "@shared/errors";

describe("the error taxonomy", () => {
  it("keeps expected and unexpected kinds disjoint", () => {
    const overlap = EXPECTED_KINDS.filter((kind) =>
      (UNEXPECTED_KINDS as readonly string[]).includes(kind),
    );
    expect(overlap).toEqual([]);
  });

  it("classifies conflicts and auth failures as expected UI states", () => {
    for (const kind of [
      "merge-conflict",
      "non-fast-forward",
      "auth-failed",
      "nothing-to-commit",
    ] as const) {
      expect(isExpectedKind(kind)).toBe(true);
    }
  });

  it("classifies a missing Git or corrupt repository as unexpected", () => {
    for (const kind of ["git-not-found", "repository-corrupt", "unknown"] as const) {
      expect(isExpectedKind(kind)).toBe(false);
    }
  });
});

describe("GitError", () => {
  const full = () =>
    new GitError({
      kind: "auth-failed",
      operation: "push",
      message: "Authentication failed for identity Work.",
      suggestedAction: "Check that Work's SSH key is unlocked.",
      repositoryPath: "/repos/infra",
      exitCode: 128,
      rawStderr: "ssh: Permission denied (publickey)",
    });

  it("carries the operation and repository so the UI can say what failed and where", () => {
    const data = full().toData();
    expect(data.operation).toBe("push");
    expect(data.repositoryPath).toBe("/repos/infra");
    expect(data.exitCode).toBe(128);
  });

  it("never includes rawStderr in the renderer-bound payload", () => {
    const data = full().toData();
    expect("rawStderr" in data).toBe(false);
    expect(JSON.stringify(data)).not.toContain("Permission denied");
  });
});

describe("Result helpers", () => {
  it("converts a GitError into its serializable data", () => {
    const result = err(
      new GitError({
        kind: "auth-failed",
        operation: "push",
        message: "nope",
        rawStderr: "secret",
      }),
    );

    expect(result.ok).toBe(false);

    if (result.ok) return;

    expect(result.error.kind).toBe("auth-failed");
    expect("rawStderr" in result.error).toBe(false);
  });
});
