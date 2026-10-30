import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openDatabase } from "@main/persistence/database";
import { SettingsRepository } from "@main/persistence/settings-repository";
import { readHardwareAcceleration } from "@main/persistence/startup-settings";

it("reads the global GPU preference before startup without a parallel settings file", () => {
  const directory = mkdtempSync(join(tmpdir(), "eda-startup-settings-"));
  const path = join(directory, "eda.db");

  try {
    expect(readHardwareAcceleration(path)).toBe(true);

    const db = openDatabase(path);

    try {
      const settings = new SettingsRepository(db);

      settings.set("hardwareAcceleration", { kind: "application" }, false);
      expect(readHardwareAcceleration(path)).toBe(false);
      expect(() =>
        settings.set("hardwareAcceleration", { kind: "profile", profileId: "any" }, true),
      ).toThrow(/cannot be changed/);

      settings.reset("hardwareAcceleration", { kind: "application" });
      expect(readHardwareAcceleration(path)).toBe(true);

      db.raw
        .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
        .run("hardwareAcceleration", '"false"');
      expect(readHardwareAcceleration(path)).toBe(true);
    } finally {
      db.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
