export type GitEnginePreference = "bundled" | "system";
export type GitEngineSource = GitEnginePreference | "custom";

export interface GitEngineInfo {
  source: GitEngineSource;
  path: string;
  version: string;
}
