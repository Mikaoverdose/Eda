import { describe, expect, it } from "vitest";
import type { Identity } from "@shared/identity/identity";
import { findIdentityForPath, matchesGlob } from "@main/identity/path-rules";

const HOME = "/home/dev";

const identity = (name: string, rules: string[]): Identity => ({
  id: `id-${name}`,
  name,
  gitName: name,
  gitEmail: `${name.toLowerCase()}@example.com`,
  hue: 210,
  signing: { format: "none", signCommits: false },
  rules,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("matchesGlob", () => {
  it("treats a plain directory as everything beneath it", () => {
    expect(matchesGlob("/home/dev/Work/api", "~/Work", HOME)).toBe(true);
    expect(matchesGlob("/home/dev/Work", "~/Work", HOME)).toBe(true);
    expect(matchesGlob("/home/dev/Personal/api", "~/Work", HOME)).toBe(false);
  });

  it("expands a leading tilde", () => {
    expect(matchesGlob("/home/dev/Projects/eda", "~/Projects/*", HOME)).toBe(true);
  });

  it("matches nested repositories under a trailing /*", () => {
    expect(matchesGlob("/home/dev/Work/client/api", "~/Work/*", HOME)).toBe(true);
  });

  it("does not match a sibling directory with a shared prefix", () => {
    expect(matchesGlob("/home/dev/Workshop/api", "~/Work/*", HOME)).toBe(false);
    expect(matchesGlob("/home/dev/Workshop", "~/Work", HOME)).toBe(false);
  });

  it("supports ** across separators and ? for a single character", () => {
    expect(matchesGlob("/src/a/b/c/repo", "/src/**/repo", HOME)).toBe(true);
    expect(matchesGlob("/src/repo", "/src/**/repo", HOME)).toBe(true);
    expect(matchesGlob("/src/notrepo", "/src/**/repo", HOME)).toBe(false);
    expect(matchesGlob("/src/a/notrepo", "/src/**/repo", HOME)).toBe(false);
    expect(matchesGlob("/src/a/repofolder", "/src/**/repo", HOME)).toBe(false);
    expect(matchesGlob("/src/repo1", "/src/repo?", HOME)).toBe(true);
    expect(matchesGlob("/src/repo12", "/src/repo?", HOME)).toBe(false);
  });

  it("compares Windows and POSIX separators alike", () => {
    expect(matchesGlob("C:\\Users\\dev\\Work\\api", "C:/Users/dev/Work/*", HOME)).toBe(true);
  });

  it("does not let a literal dot behave as a wildcard", () => {
    expect(matchesGlob("/src/axb/repo", "/src/a.b/*", HOME)).toBe(false);
  });
});

describe("findIdentityForPath", () => {
  const work = identity("Work", ["~/Work/*"]);
  const client = identity("Client", ["~/Work/client-a/*"]);
  const oss = identity("OpenSource", ["~/Projects/OpenSource/*"]);

  it("finds the identity whose rule matches", () => {
    expect(findIdentityForPath("/home/dev/Projects/OpenSource/eda", [work, oss], HOME)?.name).toBe(
      "OpenSource",
    );
  });

  it("prefers the most specific rule when several match", () => {
    expect(findIdentityForPath("/home/dev/Work/client-a/api", [work, client], HOME)?.name).toBe(
      "Client",
    );
    expect(findIdentityForPath("/home/dev/Work/internal/api", [work, client], HOME)?.name).toBe(
      "Work",
    );
  });

  it("returns undefined when nothing matches, rather than guessing", () => {
    expect(findIdentityForPath("/tmp/scratch", [work, oss], HOME)).toBeUndefined();
    expect(
      findIdentityForPath("/repos/notproject", [identity("Project", ["/repos/**/project"])], HOME),
    ).toBeUndefined();
  });

  it("ignores identities with no rules", () => {
    expect(findIdentityForPath("/home/dev/anything", [identity("Bare", [])], HOME)).toBeUndefined();
  });
});
