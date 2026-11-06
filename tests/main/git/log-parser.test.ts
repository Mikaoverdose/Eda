import { describe, expect, it } from "vitest";
import { LOG_MACHINE_READABLE } from "../../fixtures/repository-read-output";
import { parseLog } from "@main/git/parsers/log-parser";

describe("parseLog", () => {
  it("parses all parents, dates, body, and typed full-ref decorations", () => {
    const commits = parseLog(Buffer.from(LOG_MACHINE_READABLE));

    expect(commits).toHaveLength(2);
    expect(commits[0]?.parents).toHaveLength(2);
    expect(commits[0]?.author.timestamp).toBe("2026-01-01T00:00:00.000Z");
    expect(commits[0]?.decorations).toEqual([
      { type: "head", name: "main", target: "refs/heads/main" },
      { type: "tag", name: "v1.0" },
      { type: "remote-branch", name: "origin/main" },
    ]);
    expect(commits[1]?.parents).toEqual([]);
  });

  it("rejects records with invalid object ids", () => {
    const malformed = ["not-an-oid", "", "a", "b", "1", "1", "s", "", "", ""].join("\0");
    expect(() => parseLog(Buffer.from(malformed))).toThrow(/history/i);
  });
});
