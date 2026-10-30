import type { BranchSummary } from "../repository/repository-write";

export interface RemoteSummary {
  name: string;
  fetchUrls: string[];
  pushUrls: string[];
}

export interface RemoteState {
  remotes: RemoteSummary[];
  branches: (BranchSummary & { upstreamState: string })[];
}

export type RemoteChange =
  | { kind: "add"; name: string; url: string }
  | { kind: "url"; name: string; url: string; push: boolean }
  | { kind: "rename"; name: string; to: string }
  | { kind: "remove"; name: string };

export interface TransportCredentials {
  username: string;
  password: string;
}

export interface FetchRequest {
  repositoryId: string;
  remote: string | null;
  prune: boolean;
  tags: boolean;
  credentials?: TransportCredentials;
}

export interface PushRequest {
  repositoryId: string;
  remote: string;
  branch: string;
  destination: string;
  setUpstream: boolean;
  mode: "normal" | "lease" | "force" | "delete";
  refKind?: "branch" | "tag";
  credentials?: TransportCredentials;
}

export interface PushPreview {
  token: string;
  url: string;
  source: string;
  destination: string;
  localOid: string | null;
  remoteOid: string | null;
  mode: "normal" | "lease" | "force" | "delete";
}

export interface CloneRequest {
  profileId: string;
  url: string;
  parent: string;
  name: string;
  credentials?: TransportCredentials;
}
