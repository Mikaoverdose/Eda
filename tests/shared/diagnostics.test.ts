import { describe, expect, it } from "vitest";
import { redactDiagnostic } from "@shared/diagnostics";
import { err, GitError } from "@shared/errors";

describe("external diagnostics", () => {
  it.each([
    ["failed https://user:secret@example.com/repo", "secret"],
    ["failed https://encoded%40secret@example.com/repo", "encoded%40secret"],
    ["url https://example.com/repo?access_token=private#fragment", "private"],
    ["Authorization: Bearer private", "private"],
    ["authorization=Basic private", "private"],
    ['passphrase="two word secret"', "two word secret"],
    ["token=private password: private client_secret=private", "private"],
    ['{"password":"private","access_token":"private"}', "private"],
    [
      "-----BEGIN OPENSSH PRIVATE KEY-----\nprivate\n-----END OPENSSH PRIVATE KEY-----",
      "\nprivate\n",
    ],
    ["fatal: github_pat_private ghp_private glpat-private", "private"],
  ])("removes credentials from %s", (input, secret) => {
    expect(redactDiagnostic(input)).not.toContain(secret);
    expect(redactDiagnostic(input)).toContain("[redacted");
  });

  it("preserves ordinary actionable diagnostics", () => {
    const diagnostic = "C:\\repos\\work: index.lock exists. SSH agent refused operation.";
    expect(redactDiagnostic(diagnostic)).toBe(diagnostic);
  });

  it("sanitizes both thrown errors and plain IPC error data and omits raw output", () => {
    const data = {
      kind: "unknown" as const,
      operation: "fetch",
      message: "fatal: https://user:private@example.com/repo",
      rawStderr: "password=private",
    };

    const error = new GitError(data);

    expect(error.message).not.toContain("private");
    expect(error.rawStderr).not.toContain("private");
    expect(error.stack).not.toContain("private");

    for (const result of [err(error), err(data)]) {
      expect(JSON.stringify(result)).not.toContain("private");
      expect(result).not.toHaveProperty("error.rawStderr");
    }
  });
});
