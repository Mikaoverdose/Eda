export interface BuildInfo {
  version: string;
  displayVersion: string;
  commit: string | null;
  dirty: boolean | null;
}
