export interface DiscardPreview {
  patch?: string;
  token: string;
  paths: string[];
  tracked: number;
  untracked: number;
  bytes: number;
}

export interface RecoverySummary {
  source?:
    | "merge-abort"
    | "stash-abort"
    | "rebase-recovery"
    | "stash-file-restore"
    | "replay-recovery"
    | "rewrite-recovery"
    | "reset-recovery";
  indexOnly?: boolean;
  indexVersions?: { path: string; stage: number; mode: string }[];
  id: string;
  createdAt: string;
  paths: string[];
  state: "prepared" | "completed" | "restored";
  bytes: number;
}
