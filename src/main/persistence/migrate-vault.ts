import { ERROR_CODE } from "@shared/error-codes";
import { AppError } from "@shared/errors";

const MIGRATIONS = import.meta.glob("./migrations/*/vault.ts", {
  import: "default",
  eager: true,
}) as Record<string, (vault: Record<string, string>) => void>;
const HISTORY_KEY = "__eda_migrations";

export function applyVaultMigrations(vault: Record<string, string>): boolean {
  if (Object.keys(vault).length === 0) return false;
  const paths = Object.keys(MIGRATIONS).sort();
  const ids = paths.map((path) => path.split("/").at(-2)!);
  let applied: unknown;
  try {
    applied = JSON.parse(vault[HISTORY_KEY] ?? "[]");
  } catch {
    throw new AppError(ERROR_CODE.MIGRATION_HISTORY_MISMATCH);
  }
  if (
    !Array.isArray(applied) ||
    applied.some(
      (id, i) => typeof id !== "string" || id.replaceAll("-", "_") !== ids[i]?.replaceAll("-", "_"),
    )
  )
    throw new AppError(ERROR_CODE.MIGRATION_HISTORY_MISMATCH);
  if (applied.length === ids.length) return false;
  for (const path of paths.slice(applied.length)) MIGRATIONS[path]!(vault);
  vault[HISTORY_KEY] = JSON.stringify(ids);
  return true;
}
