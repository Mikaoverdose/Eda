import type { ObjectId, RepositoryPathsRequest } from "./repository-read";

export interface BranchSummary {
  name: string;
  oid: ObjectId;
  isHead: boolean;
  remote: boolean;
  upstream?: string;
  worktreePath?: string;
}

export interface TagSummary {
  name: string;
  oid: ObjectId;
  createdAt?: string;
  annotated?: boolean;
  message?: string;
  tagger?: string;
}

export type StageRequest = RepositoryPathsRequest;

export interface CommitRequest {
  repositoryId: string;
  message: string;
  amend?: boolean;
  signOff?: boolean;
  stagePaths?: string[];
}

export interface CommitResult {
  oid: ObjectId;
  publishedCommits?: number;
}

export interface BranchRequest {
  repositoryId: string;
  name: string;
}

export interface CreateBranchRequest extends BranchRequest {
  checkout?: boolean;
  startPoint?: ObjectId;
}

export interface DeleteBranchRequest extends BranchRequest {
  force?: boolean;
}

export interface RenameBranchRequest {
  repositoryId: string;
  from: string;
  to: string;
}

export interface CreateTagRequest {
  sign?: boolean;
  repositoryId: string;
  name: string;
  message?: string;
  target?: ObjectId;
}

export interface TagRequest {
  repositoryId: string;
  name: string;
}

export interface TagVerification {
  oid: string;
  status: "verified" | "unverified" | "unsigned";
  diagnostics: string;
}

export interface CommitPreview {
  author: { name?: string; email?: string };
  matchesProfile: boolean;
  signing: string;
  signingEnabled: boolean;
  additions: number;
  deletions: number;
  binaryFiles: number;
  sharedRefs: string[];
}
