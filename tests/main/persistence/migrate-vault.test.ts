import { expect, it } from "vitest";
import { applyVaultMigrations } from "@main/persistence/migrate-vault";
import { secretKeys } from "@main/secrets/secret-store";

it("runs pending vault migrations once and records their completion", () => {
  const legacy = secretKeys.provider("work", "github", "github.com", "7") + ":old";
  const oauth = secretKeys.provider("work", "github-oauth", "github.com", "7") + ":new";
  const vault = { [legacy]: "legacy", [oauth]: "oauth", unrelated: "preserved" };
  expect(applyVaultMigrations(vault)).toBe(true);
  expect(vault).toEqual({
    [oauth]: "oauth",
    unrelated: "preserved",
    __eda_migrations: JSON.stringify(["20261108000000_github_oauth"]),
  });
  expect(applyVaultMigrations(vault)).toBe(false);
});

it.each(["not json", "{}", '["unknown-migration"]'])(
  "preserves credentials when vault history is invalid (%s)",
  (history) => {
    const vault = { __eda_migrations: history, secret: "preserved" };
    expect(() => applyVaultMigrations(vault)).toThrow(/history does not match/);
    expect(vault).toEqual({ __eda_migrations: history, secret: "preserved" });
  },
);

it("does not create a vault just to record migrations", () => {
  const vault = {};
  expect(applyVaultMigrations(vault)).toBe(false);
  expect(vault).toEqual({});
});

it("accepts legacy dash names without rerunning vault cleanup or rewriting history", () => {
  const legacy = secretKeys.provider("work", "github", "github.com", "7") + ":old";
  const vault = {
    __eda_migrations: JSON.stringify(["20261108000000_github-oauth"]),
    [legacy]: "written after migration",
  };
  expect(applyVaultMigrations(vault)).toBe(false);
  expect(vault[legacy]).toBe("written after migration");
  expect(vault.__eda_migrations).toBe(JSON.stringify(["20261108000000_github-oauth"]));
});
