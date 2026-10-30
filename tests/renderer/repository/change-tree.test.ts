import { describe, expect, it } from "vitest";
import type { RepositoryChange } from "@shared/repository/repository-read";
import {
  buildChangeTree,
  flattenChangeTree,
  collapsedDescendants,
} from "@renderer/repository/change-tree";

const change = (path: string): RepositoryChange => ({
  kind: "ordinary",
  path,
  index: "M",
  worktree: ".",
  submodule: "N...",
});

const paths = (changes: string[]) => changes.map(change);

describe("buildChangeTree", () => {
  it("nests files under their directory segments", () => {
    const tree = buildChangeTree(paths(["src/main/git/git-service.ts", "src/renderer/App.tsx"]));

    expect(tree.map((node) => node.name)).toEqual(["src"]);
    const src = tree[0]!;
    expect(src.kind).toBe("directory");
    expect(src.children.map((n) => n.name)).toEqual(["main", "renderer"]);
  });

  it("puts a root-level file at the top level", () => {
    const tree = buildChangeTree(paths(["README.md"]));
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: "file", name: "README.md", path: "README.md" });
  });

  it("sorts directories before files, each alphabetically", () => {
    const tree = buildChangeTree(paths(["b.txt", "a.txt", "zz/nested.txt"]));
    expect(tree.map((n) => n.name)).toEqual(["zz", "a.txt", "b.txt"]);
  });

  it("gives every directory a path so its collapse state is stable", () => {
    const tree = buildChangeTree(paths(["src/main/a.ts", "src/main/b.ts"]));
    expect(tree[0]!.path).toBe("src");
    expect(tree[0]!.children[0]!.path).toBe("src/main");
  });
});

describe("flattenChangeTree", () => {
  it("emits a depth-tagged row per node so the flat virtual list can render it", () => {
    const tree = buildChangeTree(paths(["src/main/a.ts"]));
    const rows = flattenChangeTree(tree, new Set());

    expect(rows.map((r) => [r.node.name, r.depth])).toEqual([
      ["src", 0],
      ["main", 1],
      ["a.ts", 2],
    ]);
  });

  it("hides descendants of a collapsed directory but keeps the directory itself", () => {
    const tree = buildChangeTree(paths(["src/main/a.ts", "README.md"]));
    const rows = flattenChangeTree(tree, new Set(["src"]));

    expect(rows.map((r) => r.node.name)).toEqual(["src", "README.md"]);
  });

  it("collapses only the named directory, not a same-named nested one", () => {
    const tree = buildChangeTree(paths(["src/main/a.ts", "other/main/b.ts"]));
    const rows = flattenChangeTree(tree, new Set(["other/main"]));

    expect(rows.map((r) => r.node.path)).toEqual([
      "other",
      "other/main",
      "src",
      "src/main",
      "src/main/a.ts",
    ]);
  });
});

describe("buildChangeTree edge cases", () => {
  it("returns nothing for an empty change list", () => {
    expect(buildChangeTree([])).toEqual([]);
  });

  it("handles a deeply nested path without losing a level", () => {
    const deep = "a/b/c/d/e/f/g/leaf.ts";
    const rows = flattenChangeTree(buildChangeTree(paths([deep])), new Set());
    expect(rows).toHaveLength(8);
    expect(rows.at(-1)).toMatchObject({ depth: 7, node: { name: "leaf.ts" } });
  });

  it("nests every directory level under one parent when paths share a prefix", () => {
    const tree = buildChangeTree(paths(["src/a.ts", "src/b.ts", "src/deep/c.ts"]));
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children.map((n) => n.name)).toEqual(["deep", "a.ts", "b.ts"]);
  });
});

describe("flattenChangeTree edge cases", () => {
  it("emits nothing for an empty tree", () => {
    expect(flattenChangeTree([], new Set())).toEqual([]);
  });

  it("collapsing a leaf directory hides its files but keeps siblings", () => {
    const tree = buildChangeTree(paths(["src/main/a.ts", "src/b.ts"]));
    const rows = flattenChangeTree(tree, new Set(["src/main"]));
    expect(rows.map((r) => r.node.path)).toEqual(["src", "src/main", "src/b.ts"]);
  });

  it("a collapsed ancestor hides descendants even if they are not themselves collapsed", () => {
    const tree = buildChangeTree(paths(["a/b/c/file.ts"]));
    const rows = flattenChangeTree(tree, new Set(["a"]));
    expect(rows.map((r) => r.node.path)).toEqual(["a"]);
  });

  it("ignores a collapse key that matches no directory", () => {
    const tree = buildChangeTree(paths(["src/a.ts"]));
    expect(flattenChangeTree(tree, new Set(["does/not/exist"]))).toHaveLength(2);
  });
});

describe("collapsedDescendants", () => {
  it("counts the files hidden beneath a directory", () => {
    const tree = buildChangeTree(paths(["src/main/a.ts", "src/main/b.ts", "src/c.ts"]));
    expect(collapsedDescendants(tree[0]!)).toBe(3);
  });
});
