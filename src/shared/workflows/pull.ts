import type { TransportCredentials } from "../integrations/remotes";

export const PULL_STRATEGIES = ["ff", "ff-only", "rebase"] as const;
export type PullStrategy = (typeof PULL_STRATEGIES)[number];

export function isPullStrategy(value: unknown): value is PullStrategy {
  return typeof value === "string" && PULL_STRATEGIES.some((strategy) => strategy === value);
}

export interface PullRequest {
  repositoryId: string;
  strategy: PullStrategy;
  credentials?: TransportCredentials;
}

export interface PullPreview {
  blockedReason?: string;
  token: string;
  branch: string;
  upstream: string;
  head: string;
  source: string;
  ahead: number;
  behind: number;
  strategy: PullStrategy;
}
