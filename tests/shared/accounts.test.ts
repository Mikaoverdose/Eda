import { describe, expect, it } from "vitest";
import { accountCacheKey, accountOwnerKey } from "@shared/identity/accounts";

describe("provider account ownership contract", () => {
  it("separates accounts, profiles and enterprise hosts while canonicalizing host case", () => {
    const work = { profileId: "work", provider: "github", host: "GITHUB.COM", accountId: "a" };

    expect(accountOwnerKey(work)).toBe(accountOwnerKey({ ...work, host: "github.com." }));

    const keys = [
      work,
      { ...work, accountId: "b" },
      { ...work, profileId: "home" },
      { ...work, host: "git.example.com" },
    ].map((owner) => accountCacheKey(owner, "current-user"));

    expect(new Set(keys).size).toBe(4);
    expect(() => accountOwnerKey({ ...work, host: "https://github.com/token" })).toThrow();
  });
});
