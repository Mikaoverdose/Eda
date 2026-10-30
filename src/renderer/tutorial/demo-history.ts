import { t } from "@shared/i18n";
import type { HistoryCommit } from "@shared/repository/repository-read";
import type { BranchSummary, TagSummary } from "@shared/repository/repository-write";

const nodes = [
  {
    id: "a8e34f1",
    parents: ["bc82a9d"],
    subject: t("tutorial.demoHistory.addAFriendlyGreeting"),
    author: t("tutorial.demoHistory.edaExplorer"),
  },
  {
    id: "d17c6e2",
    parents: ["f8a24d0"],
    subject: t("tutorial.demoHistory.rememberTheSelectedColorTheme"),
    author: t("tutorial.demoHistory.mikaChen"),
  },
  {
    id: "bc82a9d",
    parents: ["c93d1a4", "e72b6c8"],
    subject: t("tutorial.demoHistory.mergeFeatureNavigationIntoMain"),
    author: t("tutorial.demoHistory.edaExplorer"),
  },
  {
    id: "c93d1a4",
    parents: ["83b7e29"],
    subject: t("tutorial.demoHistory.documentLocalDevelopment"),
    author: t("tutorial.demoHistory.edaExplorer"),
  },
  {
    id: "e72b6c8",
    parents: ["49d2f60"],
    subject: t("tutorial.demoHistory.addKeyboardNavigation"),
    author: t("tutorial.demoHistory.alexRivera"),
  },
  {
    id: "f8a24d0",
    parents: ["83b7e29"],
    subject: t("tutorial.demoHistory.addLightAndDarkThemeTokens"),
    author: t("tutorial.demoHistory.mikaChen"),
  },
  {
    id: "49d2f60",
    parents: ["83b7e29"],
    subject: t("tutorial.demoHistory.buildTheNavigationMenu"),
    author: t("tutorial.demoHistory.alexRivera"),
  },
  {
    id: "83b7e29",
    parents: ["63c1a87"],
    subject: t("tutorial.demoHistory.releaseTheFirstPreview"),
    author: t("tutorial.demoHistory.edaExplorer"),
  },
  {
    id: "63c1a87",
    parents: ["76e9b31"],
    subject: t("tutorial.demoHistory.improveContrastAndFocusStates"),
    author: t("tutorial.demoHistory.mikaChen"),
  },
  {
    id: "76e9b31",
    parents: ["21a5c94"],
    subject: t("tutorial.demoHistory.createTheHomePage"),
    author: t("tutorial.demoHistory.edaExplorer"),
  },
  {
    id: "21a5c94",
    parents: ["35f8d02"],
    subject: t("tutorial.demoHistory.setUpTheAppAndTests"),
    author: t("tutorial.demoHistory.alexRivera"),
  },
  {
    id: "35f8d02",
    parents: [],
    subject: t("tutorial.demoHistory.startTheProject"),
    author: t("tutorial.demoHistory.edaExplorer"),
  },
];
const oid = (id: string) => id.repeat(6).slice(0, 40);
export const demoBranches: BranchSummary[] = [
  { name: "main", oid: oid("a8e34f1"), isHead: true, remote: false, upstream: "origin/main" },
  {
    name: "feature/dark-mode",
    oid: oid("d17c6e2"),
    isHead: false,
    remote: false,
    upstream: "origin/feature/dark-mode",
  },
  { name: "origin/main", oid: oid("bc82a9d"), isHead: false, remote: true },
  { name: "origin/feature/dark-mode", oid: oid("d17c6e2"), isHead: false, remote: true },
  { name: "origin/feature/navigation", oid: oid("e72b6c8"), isHead: false, remote: true },
];
export const demoTags: TagSummary[] = [{ name: "v0.1.0", oid: oid("83b7e29") }];
export const commits: HistoryCommit[] = nodes.map((node, index) => {
  const timestamp = new Date(Date.UTC(2026, 0, 6, 16) - index * 3_600_000 * 6).toISOString();
  const objectId = oid(node.id);
  return {
    oid: objectId,
    parents: node.parents.map(oid),
    subject: node.subject,
    body:
      node.parents.length > 1
        ? t("tutorial.demoHistory.bringTheNavigationWorkBackIntoTheMainBranch")
        : t("tutorial.demoHistory.aSmallImprovementToTheHelloEdaDemoProject"),
    author: {
      name: node.author,
      email: `${node.author.split(" ")[0]!.toLowerCase()}@example.test`,
      timestamp,
    },
    committerTimestamp: timestamp,
    decorations: [
      ...demoBranches
        .filter((branch) => branch.oid === objectId)
        .flatMap((branch) => [
          ...(branch.isHead ? [{ type: "head" as const, name: "HEAD" }] : []),
          {
            type: branch.remote ? ("remote-branch" as const) : ("local-branch" as const),
            name: branch.name,
          },
        ]),
      ...demoTags
        .filter((tag) => tag.oid === objectId)
        .map((tag) => ({ type: "tag" as const, name: tag.name })),
    ],
  };
});

export function containingDemoRefs(target: string): string[] {
  const contains = (tip: string): boolean => {
    const pending = [tip];
    const seen = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!;
      if (current === target) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      pending.push(...(commits.find((commit) => commit.oid === current)?.parents ?? []));
    }
    return false;
  };
  return [...demoBranches, ...demoTags].filter((ref) => contains(ref.oid)).map((ref) => ref.name);
}
