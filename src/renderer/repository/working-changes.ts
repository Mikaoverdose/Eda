import type { ChangeArea, RepositoryChange } from "@shared/repository/repository-read";
import type { SavedSelection } from "@shared/identity/profile-session";

export function successorPaths(
  changes: readonly RepositoryChange[],
  selection: Extract<SavedSelection, { kind: "change" }>,
): string[] {
  const area = categorizeChanges(changes)[selection.area];
  const index = area.findIndex((change) => change.path === selection.path);
  if (index < 0) return [];
  return [...area.slice(index + 1), ...area.slice(0, index).reverse()].map((change) => change.path);
}

export function categorizeChanges(
  changes: readonly RepositoryChange[],
): Record<ChangeArea, RepositoryChange[]> {
  const categories: Record<ChangeArea, RepositoryChange[]> = {
    staged: [],
    unstaged: [],
    conflicted: [],
    untracked: [],
  };

  for (const change of changes) {
    if (change.kind === "ignored") continue;

    if (change.kind === "unmerged" || change.index === "U" || change.worktree === "U")
      categories.conflicted.push(change);
    else if (change.kind === "untracked" || change.worktree === "?")
      categories.untracked.push(change);
    else {
      if (change.index !== ".") categories.staged.push(change);
      if (change.worktree !== ".") categories.unstaged.push(change);
    }
  }

  return categories;
}
