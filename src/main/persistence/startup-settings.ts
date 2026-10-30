import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { builtInSetting } from "@shared/preferences/settings";

export function readHardwareAcceleration(path: string): boolean {
  const fallback = builtInSetting("hardwareAcceleration").value;

  if (!existsSync(path)) return fallback;

  let db: DatabaseSync | undefined;

  try {
    db = new DatabaseSync(path, { readOnly: true });
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("hardwareAcceleration");
    if (!row || typeof row["value"] !== "string") return fallback;
    const value: unknown = JSON.parse(row["value"]);
    return typeof value === "boolean" ? value : fallback;
  } catch {
    return fallback;
  } finally {
    db?.close();
  }
}
