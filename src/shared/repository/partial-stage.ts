export interface PartialStageRequest {
  repositoryId: string;
  path: string;
  area: "staged" | "unstaged";
  hunks?: number[];
  lines?: { hunk: number; line: number }[];
}

export interface PartialStagePreview {
  token: string;
  patch: string;
  additions: number;
  deletions: number;
}
