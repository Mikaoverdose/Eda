import { describe, expect, it } from "vitest";
import { STATUS_PORCELAIN_V2_Z } from "../../fixtures/repository-read-output";
import { parseStatus } from "@main/git/parsers/status-parser";

describe("parseStatus", () => {
  it("parses branch metadata, tracked changes, renames, and untracked files", () => {
    const status = parseStatus(STATUS_PORCELAIN_V2_Z);

    expect(status.branch).toMatchObject({
      head: "main",
      upstream: "origin/main",
      ahead: 2,
      behind: 1,
    });
    expect(status.changes).toHaveLength(3);
    expect(status.changes[1]).toMatchObject({
      kind: "rename",
      path: "renamed.txt",
      originalPath: "old.txt",
      score: 100,
      index: "R",
      worktree: ".",
    });
    expect(status.changes[2]).toMatchObject({
      kind: "untracked",
      path: "untracked.txt",
      index: "?",
      worktree: "?",
    });
  });

  it("rejects malformed records instead of returning partial state", () => {
    expect(() => parseStatus(Buffer.from("1 malformed\0"))).toThrow(/status/i);
  });
});

const OID = "08f668f7595cf802aa7c837fb2f9198859011ee2";
const record = (...fields: string[]) => `${fields.join("\0")}\0`;
const ordinary = (codes: string, path: string) =>
  `1 ${codes} N... 100644 100644 100644 ${OID} ${OID} ${path}`;

describe("parseStatus branch header", () => {
  it("reports a clean repository with no changes", () => {
    const status = parseStatus(Buffer.from(record(`# branch.oid ${OID}`, "# branch.head main")));
    expect(status.changes).toEqual([]);
    expect(status.branch).toMatchObject({ head: "main", ahead: 0, behind: 0 });
  });

  it("reports an unborn branch, which has no commits yet", () => {
    const status = parseStatus(Buffer.from(record("# branch.oid (initial)", "# branch.head main")));
    expect(status.branch.unborn).toBe(true);
  });

  it("reports a detached HEAD", () => {
    const status = parseStatus(
      Buffer.from(record(`# branch.oid ${OID}`, "# branch.head (detached)")),
    );
    expect(status.branch.detached).toBe(true);
  });

  it("defaults ahead and behind to zero when there is no upstream", () => {
    const status = parseStatus(Buffer.from(record(`# branch.oid ${OID}`, "# branch.head main")));
    expect(status.branch.upstream).toBeUndefined();
    expect([status.branch.ahead, status.branch.behind]).toEqual([0, 0]);
  });

  it("parses a branch that is only behind", () => {
    const status = parseStatus(
      Buffer.from(
        record(
          `# branch.oid ${OID}`,
          "# branch.head main",
          "# branch.upstream origin/main",
          "# branch.ab +0 -7",
        ),
      ),
    );

    expect([status.branch.ahead, status.branch.behind]).toEqual([0, 7]);
  });

  it("keeps a branch name containing a slash intact", () => {
    const status = parseStatus(
      Buffer.from(record(`# branch.oid ${OID}`, "# branch.head feature/nested/name")),
    );
    expect(status.branch.head).toBe("feature/nested/name");
  });

  it("rejects an abbreviated object id in the branch header", () => {
    expect(() =>
      parseStatus(Buffer.from(record("# branch.oid abc123", "# branch.head main"))),
    ).toThrow(/status/i);
  });
});

describe("parseStatus change records", () => {
  const withHeader = (body: string) =>
    parseStatus(Buffer.from(record(`# branch.oid ${OID}`, "# branch.head main") + body));

  it("separates the index code from the worktree code", () => {
    const [staged, unstaged, both] = withHeader(
      record(
        ordinary("M.", "staged.txt"),
        ordinary(".M", "unstaged.txt"),
        ordinary("MM", "both.txt"),
      ),
    ).changes;

    expect(staged).toMatchObject({ index: "M", worktree: "." });
    expect(unstaged).toMatchObject({ index: ".", worktree: "M" });
    expect(both).toMatchObject({ index: "M", worktree: "M" });
  });

  it("reads the rename score and the original path that follows the record", () => {
    const change = withHeader(
      record(`2 R. N... 100644 100644 100644 ${OID} ${OID} R100 new/name.txt`, "old/name.txt"),
    ).changes[0];

    expect(change).toMatchObject({
      kind: "rename",
      path: "new/name.txt",
      originalPath: "old/name.txt",
      score: 100,
    });
  });

  it("reads a copy record, which shares the rename shape", () => {
    const change = withHeader(
      record(`2 C. N... 100644 100644 100644 ${OID} ${OID} C075 copy.txt`, "source.txt"),
    ).changes[0];
    expect(change).toMatchObject({ path: "copy.txt", originalPath: "source.txt", score: 75 });
  });

  it("keeps spaces in a path, since fields are NUL-separated", () => {
    const change = withHeader(record(ordinary(".M", "dir with space/file name.txt"))).changes[0];
    expect(change?.path).toBe("dir with space/file name.txt");
  });

  it("decodes non-ASCII paths as UTF-8", () => {
    const change = withHeader(record(ordinary(".M", "café/日本語.txt"))).changes[0];
    expect(change?.path).toBe("café/日本語.txt");
  });

  it("marks an unmerged record as a conflict", () => {
    const change = withHeader(
      record(`u UU N... 100644 100644 100644 100644 ${OID} ${OID} ${OID} conflict.txt`),
    ).changes[0];
    expect(change).toMatchObject({ kind: "unmerged", path: "conflict.txt" });
  });

  it("distinguishes ignored files from untracked ones", () => {
    const changes = withHeader(record("? untracked.txt", "! ignored.txt")).changes;
    expect(changes.map((c) => c.kind)).toEqual(["untracked", "ignored"]);
  });

  it("returns no changes for empty output", () => {
    expect(parseStatus(Buffer.from("")).changes).toEqual([]);
  });

  it("rejects a record whose path is empty", () => {
    expect(() => parseStatus(Buffer.from(record("? ")))).toThrow(/status/i);
  });

  it("rejects an unknown record type rather than skipping it", () => {
    expect(() => parseStatus(Buffer.from(record("9 something strange")))).toThrow(/status/i);
  });

  it("rejects a rename record missing its original path", () => {
    expect(() =>
      parseStatus(
        Buffer.from(
          record(
            `# branch.oid ${OID}`,
            "# branch.head main",
            `2 R. N... 100644 100644 100644 ${OID} ${OID} R100 new.txt`,
          ),
        ),
      ),
    ).toThrow(/status/i);
  });
});
