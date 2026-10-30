import { expect, it } from "vitest";

it("wipes every user table but preserves migrations and a usable fresh database", async () => {
  const { openInMemoryDatabase } = await import("@main/persistence/database");
  const { clearDatabase } = await import("@main/application/reset-data");
  const { SettingsRepository } = await import("@main/persistence/settings-repository");
  const { IdentityRepository } = await import("@main/persistence/identity-repository");
  const db = openInMemoryDatabase();
  try {
    const settings = new SettingsRepository(db);
    const profiles = new IdentityRepository(db, settings);
    const profile = profiles.create({
      name: "Old profile",
      gitName: "Old author",
      gitEmail: "old@example.com",
      hue: 210,
      signing: { format: "none", signCommits: false },
      rules: [],
    });
    profiles.setActiveId(profile.id);
    settings.set("background", { kind: "application" }, { image: "", strength: 70, blur: 12 });
    const migrations = db.raw.prepare("SELECT * FROM __drizzle_migrations").all();
    clearDatabase(db);
    expect(profiles.list()).toEqual([]);
    expect(profiles.getActiveId()).toBeNull();
    expect(settings.resolve("background").value).toEqual({ image: "", strength: 20, blur: 2 });
    expect(db.raw.prepare("SELECT * FROM __drizzle_migrations").all()).toEqual(migrations);
    expect(db.raw.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    const fresh = profiles.create({
      name: "New profile",
      gitName: "New author",
      gitEmail: "new@example.com",
      hue: 210,
      signing: { format: "none", signCommits: false },
      rules: [],
    });
    profiles.setActiveId(fresh.id);
    expect(profiles.getActiveId()).toBe(fresh.id);
  } finally {
    db.close();
  }
});
