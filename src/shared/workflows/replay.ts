export type ReplayKind = "cherry-pick" | "revert";

export type ReplayAction = "start" | "continue" | "skip" | "abort";

export interface ReplayCommit {
  oid: string;
  subject: string;
  parents: string[];
}

export interface ReplayReview {
  token: string;
  kind: ReplayKind;
  action: ReplayAction;
  head: string;
  branch: string | null;
  commits: ReplayCommit[];
  mainline?: number;
  author: string;
  email: string;
  paths: string[];
  recoveryBytes: number;
}

export interface ReplayResult {
  recoveryWarning?: string;
  state: "completed" | "needs-attention";
  head: string | null;
}
