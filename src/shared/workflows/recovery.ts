export interface DiscardPreview {
  patch?: string;
  token: string;
  paths: string[];
  tracked: number;
  untracked: number;
  bytes: number;
}

export const RECOVERY_SOURCES = [
  "merge-abort",
  "stash-abort",
  "rebase-recovery",
  "stash-file-restore",
  "replay-recovery",
  "rewrite-recovery",
  "reset-recovery",
] as const;
export const RECOVERY_STATES = ["prepared", "completed", "restored"] as const;

export interface RecoverySummary {
  source?: (typeof RECOVERY_SOURCES)[number];
  indexOnly?: boolean;
  indexVersions?: { path: string; stage: number; mode: string }[];
  id: string;
  createdAt: string;
  paths: string[];
  state: (typeof RECOVERY_STATES)[number];
  bytes: number;
}
