export type IgnoreKind = "path" | "extension" | "directory";

export interface IgnoreInspection {
  ignored: boolean;
  tracked: boolean;
  source?: string;
  line?: string;
  pattern?: string;
  rule: string;
}
