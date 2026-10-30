export const MAX_FILE_VIEW_PATHS = 2_000;

export interface FileView {
  mode: "flat" | "path" | "tree";
  query: string;
  status: string;
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
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const input = value as Record<string, unknown>;

  return (
    Object.keys(input).every((key) =>
      ["mode", "query", "status", "collapsed", "selected"].includes(key),
    ) &&
    ["flat", "path", "tree"].includes(String(input["mode"])) &&
    typeof input["query"] === "string" &&
    input["query"].length <= 512 &&
    ["", "M", "A", "D", "R", "C", "T", "U", "?"].includes(String(input["status"])) &&
    ["collapsed", "selected"].every(
      (key) =>
        Array.isArray(input[key]) &&
        input[key].length <= MAX_FILE_VIEW_PATHS &&
        input[key].every((path: unknown) => typeof path === "string" && path.length <= 4100),
    )
  );
}
