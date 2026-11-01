import type { MessageKey } from "@shared/i18n";
import type { FileView } from "@shared/preferences/file-view";
import {
  CHANGE_AREAS,
  type ChangeArea,
  type RepositoryChange,
} from "@shared/repository/repository-read";
import {
  buildChangeTree,
  flattenChangeTree,
  type ChangeTreeNode,
} from "../../repository/change-tree";

export const CHANGE_AREA_LABELS = {
  conflicted: "changes.changeListModel.conflicts",
  staged: "changes.changeListModel.staged",
  unstaged: "changes.changeListModel.unstaged",
  untracked: "changes.changeListModel.untracked",
} satisfies Record<ChangeArea, MessageKey>;

export type ChangeListRow =
  | { kind: "heading"; area: ChangeArea }
  | { kind: "change"; area: ChangeArea; change: RepositoryChange; depth: number }
  | { kind: "directory"; area: ChangeArea; node: ChangeTreeNode; depth: number };

export function buildChangeRows(
  categories: Record<ChangeArea, RepositoryChange[]>,
  files: FileView,
): ChangeListRow[] {
  const collapsedDirs = new Set(files.collapsed);

  return CHANGE_AREAS.flatMap((area): ChangeListRow[] => {
    if (categories[area].length === 0) return [];

    const heading = { kind: "heading" as const, area };

    if (files.mode !== "tree") {
      return [
        heading,
        ...categories[area].map((change) => ({ kind: "change" as const, area, change, depth: 0 })),
      ];
    }

    const collapsedForArea = new Set(
      [...collapsedDirs]
        .filter((key) => key.startsWith(`${area}:`))
        .map((key) => key.slice(area.length + 1)),
    );

    return [
      heading,
      ...flattenChangeTree(buildChangeTree(categories[area]), collapsedForArea, 0).map((row) =>
        row.node.kind === "file"
          ? { kind: "change" as const, area, change: row.node.change, depth: row.depth }
          : { kind: "directory" as const, area, node: row.node, depth: row.depth },
      ),
    ];
  });
}

export function changeTreePaths(node: ChangeTreeNode): string[] {
  if (node.kind === "file") return [node.path];
  return node.children.flatMap(changeTreePaths);
}
