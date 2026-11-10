import { describe, expect, it } from "vitest";
import { isIgnoredWatchPath } from "@main/repo/lifecycle/repository-watcher";

describe("isIgnoredWatchPath", () => {
  it("ignores loose objects and packfiles, which churn on every write", () => {
    expect(isIgnoredWatchPath(".git/objects/56/a6051ca2b02b04ef92d5150c9ef600403cb1de")).toBe(true);
    expect(isIgnoredWatchPath(".git/objects/pack/pack-abc.pack")).toBe(true);
  });

  it("ignores lock files, so a half-written ref does not trigger a read", () => {
    expect(isIgnoredWatchPath(".git/index.lock")).toBe(true);
    expect(isIgnoredWatchPath(".git/refs/heads/main.lock")).toBe(true);
  });

  it("ignores Git internal chatter that does not change what Eda shows", () => {
    expect(isIgnoredWatchPath(".git/COMMIT_EDITMSG")).toBe(true);
    expect(isIgnoredWatchPath(".git/logs/HEAD")).toBe(true);
    expect(isIgnoredWatchPath(".git/FETCH_HEAD")).toBe(true);
  });

  it("reports the index, refs, and HEAD, which change what Eda shows", () => {
    expect(isIgnoredWatchPath(".git/index")).toBe(false);
    expect(isIgnoredWatchPath(".git/HEAD")).toBe(false);
    expect(isIgnoredWatchPath(".git/refs/heads/main")).toBe(false);
  });

  it("reports ordinary working-tree files", () => {
    expect(isIgnoredWatchPath("src/main/index.ts")).toBe(false);
    expect(isIgnoredWatchPath("README.md")).toBe(false);
    expect(isIgnoredWatchPath("Cargo.lock")).toBe(false);
    expect(isIgnoredWatchPath("nested/yarn.lock")).toBe(false);
  });

  it("normalizes Windows separators before matching", () => {
    expect(isIgnoredWatchPath(".git\\objects\\56\\abc")).toBe(true);
    expect(isIgnoredWatchPath(".git\\refs\\heads\\main")).toBe(false);
  });

  it('does not mistake a worktree path containing "objects" for Git internals', () => {
    expect(isIgnoredWatchPath("src/objects/model.ts")).toBe(false);
  });
});
