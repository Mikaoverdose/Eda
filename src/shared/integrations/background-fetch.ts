export interface FetchHistory {
  lastAttempt: number;
  lastSuccess: number | null;
  failures: number;
  retryAt: number | null;
  error: string | null;
}

export interface BackgroundFetchState {
  intervalMinutes: number;
  online: boolean;
  suspended: boolean;
  fetching: boolean;
  remotes: {
    name: string;
    supported: boolean;
    history: FetchHistory | null;
    nextFetch: number | null;
  }[];
}
