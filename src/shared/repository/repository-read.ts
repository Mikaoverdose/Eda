import type { WorkflowState } from "../workflows/workflow";

export type ObjectId = string;
export type DiffMode = "unified" | "split";

export const HISTORY_PAGE_SIZE = 100;
export const MAX_HISTORY_PAGE_SIZE = 200;

export type ChangeCode = "." | "M" | "T" | "A" | "D" | "R" | "C" | "U" | "?" | "!";

export interface RepositoryBranchStatus {
  oid?: ObjectId;
  head?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  detached: boolean;
  unborn: boolean;
}

export interface RepositoryChange {
  kind: "ordinary" | "rename" | "unmerged" | "untracked" | "ignored";
  path: string;
  originalPath?: string;
  index: ChangeCode;
  worktree: ChangeCode;
  submodule: string;
  headOid?: ObjectId;
  indexOid?: ObjectId;
  score?: number;
}

export interface RepositoryStatus {
  workflow?: WorkflowState | null;
  capabilities?: RepositoryCapabilities;
  branch: RepositoryBranchStatus;
  changes: RepositoryChange[];
}

export interface RepositoryCapabilities {
  write: boolean;
  reason?: string;
}

export type CommitDecorationType = "head" | "local-branch" | "remote-branch" | "tag" | "ref";

export interface CommitDecoration {
  type: CommitDecorationType;
  name: string;
  target?: string;
}

export interface CommitAuthor {
  name: string;
  email: string;
  timestamp: string;
}

export interface HistoryCommit {
  stashLabels?: string[];
  oid: ObjectId;
  parents: ObjectId[];
  author: CommitAuthor;
  committerTimestamp: string;
  subject: string;
  body: string;
  decorations: CommitDecoration[];
}

export interface HistoryPage {
  commits: HistoryCommit[];
  nextOffset: number | null;
}

export interface HistoryPageRequest {
  showStashes?: boolean;
  repositoryId: string;
  offset?: number;
  limit?: number;
  refs?: string[];
  hiddenRefs?: string[];
}

export interface CommitInspection {
  commit: HistoryCommit;
  containingRefs: string[];
  shallow: boolean;
}

export type DiffLineType = "context" | "addition" | "deletion" | "no-newline";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  heading: string;
  lines: DiffLine[];
}

export interface FileDiff {
  stats?: {
    lines: number;
    additions: number;
    deletions: number;
    characters: number;
    longestLine: number;
  };
  truncated?: boolean;
  oldPath?: string;
  newPath?: string;
  oldMode?: string;
  newMode?: string;
  status: "added" | "deleted" | "modified" | "renamed" | "copied" | "type-changed";
  binary: boolean;
  hunks: DiffHunk[];
}

export interface UnifiedDiff {
  files: FileDiff[];
  omittedFiles?: number;
}

export interface RepositoryPathsRequest {
  repositoryId: string;
  paths?: string[];
}

export interface WorkingDiffRequest extends RepositoryPathsRequest {
  area: "unstaged" | "staged";
}

export interface CommitDiffRequest extends RepositoryPathsRequest {
  oid: ObjectId;
}
