import type { UnifiedDiff } from "./repository-read";

export function diffPaths(diff: UnifiedDiff | null): string[] {
  return [
    ...new Set(
      diff?.files
        .flatMap((file) => [file.oldPath, file.newPath])
        .filter((path): path is string => path !== undefined && path !== "/dev/null") ?? [],
    ),
  ];
}
