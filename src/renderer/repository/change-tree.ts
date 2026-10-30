import type { RepositoryChange } from "@shared/repository/repository-read";

export interface ChangeTreeNode {
  kind: "directory" | "file";
  name: string;
  path: string;
  children: ChangeTreeNode[];
  change?: RepositoryChange;
}

export interface ChangeTreeRow {
  node: ChangeTreeNode;
  depth: number;
}

export function buildChangeTree(changes: readonly RepositoryChange[]): ChangeTreeNode[] {
  const root: ChangeTreeNode = { kind: "directory", name: "", path: "", children: [] };

  const directories = new Map<string, ChangeTreeNode>();

  for (const change of changes) {
    const segments = change.path.split("/").filter((segment) => segment.length > 0);

    if (segments.length === 0) continue;

    let parent = root;

    for (const [index, segment] of segments.entries()) {
      const isFile = index === segments.length - 1;
      const path = parent.path ? `${parent.path}/${segment}` : segment;

      if (isFile) {
        parent.children.push({ kind: "file", name: segment, path, children: [], change });
        break;
      }

      let next = directories.get(path);

      if (!next) {
        next = { kind: "directory", name: segment, path, children: [] };
        parent.children.push(next);
        directories.set(path, next);
      }

      parent = next;
    }
  }

  sortNodes(root);

  return root.children;
}

function sortNodes(node: ChangeTreeNode): void {
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) sortNodes(child);
}

export function flattenChangeTree(
  nodes: readonly ChangeTreeNode[],
  collapsed: ReadonlySet<string>,
  depth = 0,
): ChangeTreeRow[] {
  const rows: ChangeTreeRow[] = [];

  const append = (children: readonly ChangeTreeNode[], level: number) => {
    for (const node of children) {
      rows.push({ node, depth: level });
      if (node.kind === "directory" && !collapsed.has(node.path)) append(node.children, level + 1);
    }
  };

  append(nodes, depth);

  return rows;
}

export function collapsedDescendants(node: ChangeTreeNode): number {
  if (node.kind === "file") return 1;
  return node.children.reduce((total, child) => total + collapsedDescendants(child), 0);
}
