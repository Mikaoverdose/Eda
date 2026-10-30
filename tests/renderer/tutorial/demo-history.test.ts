import { layoutCommitPage } from "@renderer/repository/dag-layout";
import {
  commits,
  demoBranches,
  demoTags,
  containingDemoRefs,
} from "@renderer/tutorial/demo-history";

it("keeps branch tips, decorations and parent order consistent", () => {
  const positions = new Map(commits.map((commit, index) => [commit.oid, index]));
  expect(positions.size).toBe(commits.length);
  expect(commits.some((commit) => commit.parents.length === 2)).toBe(true);
  for (const [index, commit] of commits.entries()) {
    for (const parent of commit.parents) expect(positions.get(parent)).toBeGreaterThan(index);
  }
  for (const ref of [...demoBranches, ...demoTags]) {
    const commit = commits.find((commit) => commit.oid === ref.oid);
    expect(commit?.decorations.some((decoration) => decoration.name === ref.name)).toBe(true);
  }
});

it("distinguishes unmerged feature work from commits merged into main", () => {
  const feature = demoBranches.find((branch) => branch.name === "feature/dark-mode")!;
  expect(containingDemoRefs(feature.oid)).toEqual([
    "feature/dark-mode",
    "origin/feature/dark-mode",
  ]);
  const merged = demoBranches.find((branch) => branch.name === "origin/feature/navigation")!;
  expect(containingDemoRefs(merged.oid)).toContain("main");
  expect(containingDemoRefs(commits.at(-1)!.oid)).toHaveLength(
    demoBranches.length + demoTags.length,
  );
});

it("renders multiple graph lanes that converge at the common ancestor", () => {
  const graph = layoutCommitPage(commits);
  expect(graph.rows.some((row) => row.laneCount >= 3)).toBe(true);
  expect(graph.rows.some((row) => row.topologyUnavailable)).toBe(false);
  expect(graph.boundary.lanes).toEqual([]);
});
