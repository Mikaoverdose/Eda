import type { MessageKey } from "./i18n";
export type OperationState = "queued" | "running" | "succeeded" | "failed" | "interrupted";

export interface OperationRecord {
  id: string;
  profileId: string;
  repositoryId: string;
  repositoryName: string;
  kind: string;
  kindKey?: MessageKey;
  state: OperationState;
  startedAt: string;
  updatedAt: string;
  durationMs: number;
  output: string;
  message: string;
  recovery?: string;
  exitCode?: number;
  cancellable: boolean;
  retryable: boolean;
}
