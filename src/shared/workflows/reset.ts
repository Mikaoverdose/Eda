export type ResetMode = "soft" | "mixed" | "hard";

export interface ResetReview {
  token: string;
  mode: ResetMode;
  head: string;
  target: string;
  branch: string | null;
  indexPaths: string[];
  workingPaths: string[];
  recoveryBytes: number;
  publishedCommits: number;
}

export interface ResetResult {
  head: string;
  recoveryRef: string;
  publishedCommits: number;
  snapshotId?: string;
}
