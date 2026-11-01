import { isOneOf, isRecord } from "../validation";

export const FILE_VIEW_MODES = ["flat", "path", "tree"] as const;
export const FILE_VIEW_STATUSES = ["", "M", "A", "D", "R", "C", "T", "U", "?"] as const;

export const MAX_FILE_VIEW_PATHS = 2_000;

export interface FileView {
  mode: (typeof FILE_VIEW_MODES)[number];
  query: string;
  status: (typeof FILE_VIEW_STATUSES)[number];
  collapsed: string[];
  selected: string[];
}

export const defaultFileView = (grouped = false): FileView => ({
  mode: grouped ? "tree" : "path",
  query: "",
  status: "",
  collapsed: [],
  selected: [],
});

export function isFileView(value: unknown): value is FileView {
  if (!isRecord(value)) return false;

  const input = value;

  return (
    Object.keys(input).every((key) =>
      ["mode", "query", "status", "collapsed", "selected"].includes(key),
    ) &&
    isOneOf(input["mode"], FILE_VIEW_MODES) &&
    typeof input["query"] === "string" &&
    input["query"].length <= 512 &&
    isOneOf(input["status"], FILE_VIEW_STATUSES) &&
    ["collapsed", "selected"].every(
      (key) =>
        Array.isArray(input[key]) &&
        input[key].length <= MAX_FILE_VIEW_PATHS &&
        input[key].every((path: unknown) => typeof path === "string" && path.length <= 4100),
    )
  );
}
