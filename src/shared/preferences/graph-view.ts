import { isOneOf, isRecord } from "../validation";

export type GraphColumnId = "author" | "date" | "sha";

export interface GraphFilter {
  refs: string[];
  hiddenRefs: string[];
  pinnedRef: string | null;
  pinnedOid?: string | undefined;
  showStashes?: boolean;
}

export const defaultGraphFilter = (): GraphFilter => ({
  refs: [],
  hiddenRefs: [],
  pinnedRef: null,
  showStashes: true,
});

export function isGraphFilter(value: unknown): value is GraphFilter {
  if (!isRecord(value)) return false;

  const item = value;
  const ref = (name: unknown) =>
    typeof name === "string" &&
    /^refs\/(heads|remotes|tags)\//.test(name) &&
    name.length <= 255 &&
    !/[\x00-\x20\x7f~^:?*[\\]/.test(name) &&
    !name.includes("..");

  return (
    Object.keys(item).every((key) =>
      ["refs", "hiddenRefs", "pinnedRef", "pinnedOid", "showStashes"].includes(key),
    ) &&
    (item["showStashes"] === undefined || typeof item["showStashes"] === "boolean") &&
    [item["refs"], item["hiddenRefs"]].every(
      (list) => Array.isArray(list) && list.length <= 256 && list.every(ref),
    ) &&
    (item["pinnedRef"] === null || ref(item["pinnedRef"])) &&
    (item["pinnedOid"] === undefined ||
      (typeof item["pinnedOid"] === "string" && /^[a-f0-9]{40,64}$/.test(item["pinnedOid"])))
  );
}

export interface GraphColumn {
  id: GraphColumnId;
  visible: boolean;
  width: number;
}

export const defaultGraphColumns = (): GraphColumn[] => [
  { id: "author", visible: true, width: 96 },
  { id: "date", visible: true, width: 72 },
  { id: "sha", visible: true, width: 72 },
];

export function isGraphColumns(value: unknown): value is GraphColumn[] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    new Set(value.map((item: unknown) => (isRecord(item) ? item["id"] : undefined))).size === 3 &&
    value.every(
      (item: unknown) =>
        isRecord(item) &&
        isOneOf(item["id"], ["author", "date", "sha"]) &&
        typeof item["visible"] === "boolean" &&
        typeof item["width"] === "number" &&
        Number.isInteger(item["width"]) &&
        item["width"] >= 48 &&
        item["width"] <= 320 &&
        Object.keys(item).every((key) => ["id", "visible", "width"].includes(key)),
    )
  );
}
