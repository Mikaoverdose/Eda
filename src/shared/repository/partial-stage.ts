import type { DiffArea } from "./repository-read";

export interface PartialStageRequest {
  repositoryId: string;
  path: string;
  area: DiffArea;
  hunks?: number[];
  lines?: { hunk: number; line: number }[];
}

export interface PartialStagePreview {
  token: string;
  patch: string;
  additions: number;
  deletions: number;
}
