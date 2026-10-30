import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  navigationFromArguments,
  parseRepositoryLink,
  RepositoryNavigationQueue,
} from "@main/repo/lifecycle/navigation";

describe("repository entry points", () => {
  const path = resolve("fixture");
  const link = `eda://open?path=${encodeURIComponent(path)}`;

  it("accepts inspection links and rejects commands, ambiguous parameters and option refs", () => {
    expect(parseRepositoryLink(`${link}&commit=abcdef12`)).toEqual({ path, commit: "abcdef12" });
    expect(parseRepositoryLink(`${link}&ref=feature%2Fwork`)).toEqual({
      path,
      ref: "feature/work",
    });

    for (const value of [
      `${link}&command=reset`,
      `${link}&path=another`,
      `${link}&ref=--delete`,
      `${link}&commit=HEAD~1`,
      `${link}&commit=abcdef12&ref=main`,
      "eda://open?path=relative",
      "https://example.com/open",
      `${link}#command`,
    ])
      expect(parseRepositoryLink(value)).toBeNull();
  });

  it("resolves CLI paths and bounds queued navigation without running operations", () => {
    expect(navigationFromArguments([".", "--flag", link, "https://example.com"], path)).toEqual([
      { path },
      { path },
    ]);

    const queue = new RepositoryNavigationQueue();

    queue.push(Array.from({ length: 40 }, (_, i) => ({ path: String(i) })));
    expect(queue.take()).toHaveLength(20);
    expect(queue.take()).toEqual([]);
  });
});
