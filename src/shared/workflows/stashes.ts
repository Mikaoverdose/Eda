import type { UnifiedDiff } from "../repository/repository-read";

export const MAX_STASH_ENTRIES = 200;
export const MAX_STASH_NAME_LENGTH = 1_024;

export interface StashEntry {
  oid: string;
  selector: string;
  message: string;
  timestamp: number;
}

export interface StashList {
  entries: StashEntry[];
  truncated: boolean;
}

export interface StashInspection {
  entry: StashEntry;
  token: string;
  tracked: UnifiedDiff;
  staged: UnifiedDiff;
  untracked: UnifiedDiff | null;
}

export type StashContents = "tracked" | "untracked" | "all";

export interface StashCreateOptions {
  paths?: string[];
  stagedOnly?: boolean;
  keepIndex?: boolean;
}

export type StashArea = "tracked" | "staged" | "untracked";

export interface StashFilePreview {
  token: string;
  path: string;
  area: StashArea;
  deleted: boolean;
  savedBytes: number;
  recoveryBytes: number;
}

export interface StashBranchPreview {
  token: string;
  name: string;
  base: string;
  head: string;
  branch: string | null;
}
