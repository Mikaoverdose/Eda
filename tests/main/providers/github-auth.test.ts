import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitHubAuth } from "@main/providers/github-auth";
import { GitHubAccountRepository } from "@main/persistence/github-account-repository";
import { IdentityRepository } from "@main/persistence/identity-repository";
import { openDatabase } from "@main/persistence/database";
import type { Database } from "@main/persistence/types";
import type { SecretStore } from "@main/secrets/secret-store";

const databases: Database[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) db.close();
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
const device = {
  device_code: "private-device-code",
  user_code: "ABCD-EFGH",
  verification_uri: "https://github.com/login/device",
  expires_in: 900,
  interval: 5,
};
const token = {
  access_token: "ghu_fixture_access",
  token_type: "bearer",
  scope: "",
  expires_in: 3600,
  refresh_token: "ghr_fixture_refresh",
  refresh_token_expires_in: 86400,
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

function setup(path = ":memory:", clientId = "eda-client") {
  const db = openDatabase(path);
  databases.push(db);
  const identities = new IdentityRepository(db);
  const profile = identities.create({
    name: "Work",
    gitName: "Work",
    gitEmail: "work@example.com",
    hue: 210,
    signing: { format: "none", signCommits: false },
    rules: [],
  });
  const other = identities.create({ ...profile, name: "Personal" });
  const values = new Map<string, string>();
  const secrets: SecretStore = {
    available: true,
    get: vi.fn(async (key) => values.get(key)),
    set: vi.fn(async (key, value) => {
      values.set(key, value);
    }),
    delete: vi.fn(async (key) => {
      values.delete(key);
    }),
    deleteForIdentity: vi.fn(async (id) => {
      for (const key of values.keys()) if (key.startsWith(`identity:${id}:`)) values.delete(key);
    }),
  };
  const fetch = vi.fn<typeof globalThis.fetch>();
  let now = Date.now();
  const accounts = new GitHubAccountRepository(db);
  const service = new GitHubAuth(accounts, secrets, clientId, fetch, () => now);
  const advance = (ms: number) => {
    now += ms;
  };
  const authorize = async () => {
    fetch
      .mockResolvedValueOnce(json(device))
      .mockResolvedValueOnce(json(token))
      .mockResolvedValueOnce(json({ id: 7, login: "work-user" }));
    const signIn = await service.begin(profile.id);
    advance(5000);
    await service.poll(profile.id, signIn.id);
    return signIn;
  };
  const connect = async () => {
    await authorize();
    fetch.mockResolvedValueOnce(
      json({
        total_count: 1,
        installations: [
          {
            account: { login: "work-user" },
            permissions: { contents: "read" },
            suspended_at: null,
          },
        ],
      }),
    );
    await service.repositoryAccess(profile.id);
  };
  return {
    authorize,
    db,
    identities,
    profile,
    other,
    values,
    secrets,
    accounts,
    fetch,
    service,
    advance,
    connect,
  };
}

describe("GitHub device OAuth", () => {
  it("observes a new installation instead of reusing the cached pre-installation response", async () => {
    const ctx = setup();
    await ctx.authorize();
    let installed = false;
    let cached: Response | undefined;
    ctx.fetch.mockImplementation(async (_url, options) => {
      if (options?.cache !== "no-store" && cached) return cached.clone();
      const response = json({
        total_count: installed ? 1 : 0,
        installations: installed
          ? [
              {
                account: { login: "work-user" },
                permissions: { contents: "read" },
                suspended_at: null,
              },
            ]
          : [],
      });
      cached = response.clone();
      return response;
    });
    expect((await ctx.service.repositoryAccess(ctx.profile.id)).accounts).toEqual([]);
    expect(ctx.values.size).toBe(0);
    installed = true;
    expect((await ctx.service.repositoryAccess(ctx.profile.id)).accounts).toEqual(["work-user"]);
    expect(ctx.service.status(ctx.profile.id).account?.state).toBe("connected");
    expect(ctx.values.size).toBe(1);
  });

  it("keeps authorization private and unsaved until installation is verified, and discards cancelled credentials", async () => {
    const ctx = setup();
    await ctx.authorize();
    expect(ctx.service.status(ctx.profile.id)).toMatchObject({
      account: null,
      pendingAccountId: "7",
    });
    expect(ctx.accounts.find(ctx.profile.id)).toBeUndefined();
    expect(ctx.values.size).toBe(0);
    expect(await ctx.service.profile(ctx.profile.id)).toBeNull();
    expect(() => ctx.service.profileUrl(ctx.profile.id)).toThrow();
    await expect(
      ctx.service.forFetch(ctx.profile.id, "https://github.com/org/repo"),
    ).rejects.toMatchObject({ kind: "github-auth-required" });
    ctx.fetch.mockResolvedValueOnce(json({ total_count: 0, installations: [] }));
    expect((await ctx.service.repositoryAccess(ctx.profile.id)).accounts).toEqual([]);
    expect(ctx.values.size).toBe(0);
    ctx.service.cancelProfile(ctx.profile.id);
    expect(ctx.service.status(ctx.profile.id).pendingAccountId).toBeNull();
    await expect(ctx.service.repositoryAccess(ctx.profile.id)).rejects.toMatchObject({
      kind: "github-auth-required",
    });
  });

  it("does not persist an installation result after cancellation during a vault write", async () => {
    const ctx = setup();
    const signIn = await ctx.authorize();
    ctx.fetch.mockResolvedValueOnce(
      json({
        total_count: 1,
        installations: [
          {
            account: { login: "work-user" },
            permissions: { contents: "read" },
            suspended_at: null,
          },
        ],
      }),
    );
    const write = ctx.secrets.set;
    ctx.secrets.set = vi.fn(async (key, value) => {
      await write(key, value);
      ctx.service.cancel(ctx.profile.id, signIn.id);
    });
    await expect(ctx.service.repositoryAccess(ctx.profile.id)).rejects.toMatchObject({
      kind: "github-auth-required",
    });
    expect(ctx.accounts.find(ctx.profile.id)).toBeUndefined();
    expect(ctx.values.size).toBe(0);
  });

  it("preserves a previous connection when a newly authorized account is cancelled", async () => {
    const ctx = setup();
    await ctx.connect();
    const saved = ctx.accounts.find(ctx.profile.id);
    const signIn = await ctx.authorize();
    ctx.service.cancel(ctx.other.id, signIn.id);
    expect(ctx.service.status(ctx.profile.id).pendingAccountId).toBe("7");
    ctx.service.cancel(ctx.profile.id, signIn.id);
    expect(ctx.service.status(ctx.profile.id).account?.state).toBe("connected");
    expect(ctx.accounts.find(ctx.profile.id)).toEqual(saved);
    expect(ctx.values.size).toBe(1);
  });

  it("targets the verified personal account directly without hardcoded identities", async () => {
    const ctx = setup();
    const service = new GitHubAuth(
      ctx.accounts,
      ctx.secrets,
      "client",
      ctx.fetch,
      Date.now,
      "eda-desktop",
    );
    const url = new URL(service.installationUrl("nonce", "84713269"));
    expect(url.pathname).toBe("/apps/eda-desktop/installations/new/permissions");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      target_id: "84713269",
      target_type: "User",
      state: "nonce",
    });
    expect(() => service.installationUrl(undefined, "7&evil=1")).toThrow();
  });

  it("checks installed repository permissions separately from successful account authorization", async () => {
    const ctx = setup();
    await ctx.connect();
    ctx.fetch.mockClear();
    ctx.fetch.mockResolvedValueOnce(json({ total_count: 0, installations: [] }));
    expect(await ctx.service.repositoryAccess(ctx.profile.id)).toEqual({
      accountId: "7",
      accounts: [],
    });
    expect(ctx.service.status(ctx.profile.id).account?.state).toBe("connected");
    ctx.fetch.mockResolvedValueOnce(
      json({
        total_count: 4,
        installations: [
          { account: { login: "personal" }, permissions: { contents: "read" }, suspended_at: null },
          { account: { login: "team" }, permissions: { contents: "write" }, suspended_at: null },
          {
            account: { login: "suspended" },
            permissions: { contents: "read" },
            suspended_at: "2026-01-01",
          },
          {
            account: { login: "metadata-only" },
            permissions: { metadata: "read" },
            suspended_at: null,
          },
        ],
      }),
    );
    expect(await ctx.service.repositoryAccess(ctx.profile.id)).toEqual({
      accountId: "7",
      accounts: ["personal", "team"],
    });
    expect(ctx.fetch).toHaveBeenLastCalledWith(
      "https://api.github.com/user/installations?per_page=10&page=1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${token.access_token}` }),
        redirect: "error",
      }),
    );
    await expect(ctx.service.repositoryAccess(ctx.other.id)).rejects.toMatchObject({
      kind: "github-auth-required",
    });
    expect(ctx.fetch).toHaveBeenCalledTimes(2);
  });

  it("paginates installation checks and rejects incomplete or stale results without changing the saved login", async () => {
    const ctx = setup();
    await ctx.connect();
    const installation = {
      account: { login: "team" },
      permissions: { contents: "read" },
      suspended_at: null,
    };
    ctx.fetch.mockResolvedValueOnce(
      json({ total_count: 11, installations: Array(10).fill(installation) }),
    );
    ctx.fetch.mockResolvedValueOnce(
      json({
        total_count: 11,
        installations: [{ ...installation, account: { login: "personal" } }],
      }),
    );
    expect((await ctx.service.repositoryAccess(ctx.profile.id)).accounts).toEqual([
      "personal",
      "team",
    ]);
    expect(ctx.fetch.mock.calls.at(-1)?.[0]).toBe(
      "https://api.github.com/user/installations?per_page=10&page=2",
    );
    ctx.fetch.mockResolvedValueOnce(json({ total_count: 11, installations: [] }));
    await expect(ctx.service.repositoryAccess(ctx.profile.id)).rejects.toThrow(/incomplete/);
    ctx.fetch.mockRejectedValueOnce(new Error("offline"));
    await expect(ctx.service.repositoryAccess(ctx.profile.id)).rejects.toMatchObject({
      kind: "network-failed",
    });
    expect(ctx.service.status(ctx.profile.id).account?.state).toBe("connected");
    ctx.fetch.mockImplementationOnce(async () => {
      await ctx.service.disconnect(ctx.profile.id);
      return json({ total_count: 1, installations: [installation] });
    });
    await expect(ctx.service.repositoryAccess(ctx.profile.id)).rejects.toThrow(/account changed/);
  });

  it("requires a new login only when GitHub rejects the token during an access check", async () => {
    const ctx = setup();
    await ctx.connect();
    ctx.fetch.mockResolvedValueOnce(json({ message: "Bad credentials" }, 401));
    await expect(ctx.service.repositoryAccess(ctx.profile.id)).rejects.toMatchObject({
      kind: "github-auth-required",
    });
    expect(ctx.service.status(ctx.profile.id).account?.state).toBe("expired");
  });

  it("loads basic public details for the durable saved account without reauthentication or leaking credentials", async () => {
    const ctx = setup();
    await ctx.connect();
    ctx.fetch.mockClear();
    vi.mocked(ctx.secrets.get).mockClear();
    ctx.fetch.mockResolvedValueOnce(
      json({
        id: 7,
        login: "renamed-user",
        name: "Work User",
        bio: "Hello\nGitHub",
        location: "Bangkok",
        html_url: "https://evil.invalid",
        avatar_url: "https://evil.invalid/avatar",
        email: "private@example.com",
      }),
    );
    expect(await ctx.service.profile(ctx.other.id)).toBeNull();
    const details = await ctx.service.profile(ctx.profile.id);
    expect(details).toEqual({
      id: "7",
      login: "renamed-user",
      name: "Work User",
      bio: "Hello GitHub",
      location: "Bangkok",
    });
    expect(ctx.fetch).toHaveBeenCalledExactlyOnceWith(
      "https://api.github.com/user/7",
      expect.objectContaining({ credentials: "omit", redirect: "error" }),
    );
    expect(ctx.fetch.mock.calls[0]?.[1]?.headers).not.toHaveProperty("Authorization");
    expect(ctx.secrets.get).not.toHaveBeenCalled();
    expect(ctx.service.profileUrl(ctx.profile.id)).toBe("https://github.com/renamed-user");
    expect(() => ctx.service.profileUrl(ctx.other.id)).toThrow(/Connect/);
    expect(await ctx.service.profile(ctx.profile.id)).toEqual(details);
    expect(ctx.fetch).toHaveBeenCalledOnce();
    ctx.advance(301_000);
    ctx.fetch.mockRejectedValueOnce(new Error("offline"));
    expect(await ctx.service.profile(ctx.profile.id)).toEqual(details);
    expect(ctx.service.status(ctx.profile.id).account?.state).toBe("connected");
  });

  it("keeps saved account initials when public profile details belong to another account or are unavailable", async () => {
    const ctx = setup();
    await ctx.connect();
    ctx.fetch.mockResolvedValueOnce(json({ id: 8, login: "wrong-user", name: "Wrong User" }));
    expect(await ctx.service.profile(ctx.profile.id)).toEqual({
      id: "7",
      login: "work-user",
      name: null,
      bio: null,
      location: null,
    });
    ctx.advance(61_000);
    ctx.fetch.mockRejectedValueOnce(new Error("offline"));
    expect((await ctx.service.profile(ctx.profile.id))?.name).toBeNull();
    expect(ctx.service.profileUrl(ctx.profile.id)).toBe("https://github.com/work-user");
  });

  it("honors polling/backoff, persists a verified profile-owned login across restart, refreshes tokens, and disconnects", async () => {
    const dir = await mkdtemp(join(tmpdir(), "eda-github-"));
    directories.push(dir);
    const ctx = setup(join(dir, "eda.db"));
    const { service, profile, other, fetch, advance, secrets, values, accounts } = ctx;
    fetch.mockResolvedValueOnce(json(device));
    const signIn = await service.begin(profile.id);
    expect(JSON.stringify(signIn)).not.toContain(device.device_code);
    expect(await service.poll(profile.id, signIn.id)).toEqual({
      state: "pending",
      intervalMs: 5000,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(5000);
    fetch.mockResolvedValueOnce(json({ error: "authorization_pending" }));
    await service.poll(profile.id, signIn.id);
    advance(5000);
    fetch.mockResolvedValueOnce(json({ error: "slow_down", interval: 10 }));
    expect(await service.poll(profile.id, signIn.id)).toEqual({
      state: "pending",
      intervalMs: 10000,
    });
    advance(9999);
    await service.poll(profile.id, signIn.id);
    expect(fetch).toHaveBeenCalledTimes(3);
    advance(1);
    fetch
      .mockResolvedValueOnce(json(token))
      .mockResolvedValueOnce(json({ id: 7, login: "work-user" }));
    const result = await service.poll(profile.id, signIn.id);
    expect(result).toMatchObject({
      state: "authorized",
      status: { account: null, pendingAccountId: "7" },
    });
    expect(service.status(other.id).account).toBeNull();
    expect(JSON.stringify([result, accounts.find(profile.id)])).not.toContain(token.access_token);
    expect(JSON.stringify(result)).not.toContain(token.refresh_token);
    for (const [, options] of fetch.mock.calls) {
      expect(options?.redirect).toBe("error");
      expect(options?.credentials).toBe("omit");
    }
    fetch.mockResolvedValueOnce(
      json({
        total_count: 1,
        installations: [
          {
            account: { login: "work-user" },
            permissions: { contents: "read" },
            suspended_at: null,
          },
        ],
      }),
    );
    await service.repositoryAccess(profile.id);
    const restartedDb = openDatabase(join(dir, "eda.db"));
    databases.push(restartedDb);
    const restarted = new GitHubAuth(
      new GitHubAccountRepository(restartedDb),
      secrets,
      "eda-client",
      fetch,
      () => Date.now() + 4_000_000,
    );
    fetch
      .mockResolvedValueOnce(
        json({ ...token, access_token: "ghu_refreshed", refresh_token: "ghr_rotated" }),
      )
      .mockResolvedValueOnce(json({ id: 7, login: "work-user" }));
    expect(await restarted.forFetch(profile.id, "https://github.com/org/repo.git")).toEqual({
      username: "x-access-token",
      password: "ghu_refreshed",
    });
    expect(fetch.mock.calls.at(-2)?.[1]?.body).toContain("grant_type=refresh_token");
    expect([...values.values()].join()).not.toContain(token.refresh_token);
    await restarted.disconnect(profile.id);
    expect(restarted.status(profile.id).account).toBeNull();
    expect(values.size).toBe(0);
    expect(await restarted.forFetch(profile.id, "https://github.com/org/repo.git")).toBeUndefined();
  });

  it("never supplies OAuth credentials to another profile, another host, SSH, or a malformed URL", async () => {
    const ctx = setup();
    await ctx.connect();
    expect(
      await ctx.service.forFetch(ctx.other.id, "https://github.com/org/repo.git"),
    ).toBeUndefined();
    for (const url of [
      "https://github.com.evil.invalid/org/repo",
      "https://evil.invalid/github.com/repo",
      "https://github.com@evil.invalid/org/repo",
      "https://github.com/org/repo?redirect=evil",
      "https://github.com:444/org/repo",
      "http://github.com/org/repo",
      "git@github.com:org/repo.git",
      "https://github.com/org/repo/extra",
    ]) {
      expect(await ctx.service.forFetch(ctx.profile.id, url)).toBeUndefined();
    }
    const other = { ...ctx.accounts.find(ctx.profile.id)!, profileId: ctx.other.id };
    ctx.accounts.save(other);
    ctx.secrets.get = vi.fn(ctx.secrets.get);
    await expect(
      ctx.service.forFetch(ctx.other.id, "https://github.com/org/repo"),
    ).rejects.toMatchObject({ kind: "github-auth-required" });
    expect(ctx.secrets.get).not.toHaveBeenCalled();
    await ctx.service.disconnect(ctx.other.id);
    expect(ctx.values.size).toBe(1);
    ctx.identities.delete(ctx.profile.id);
    expect(ctx.accounts.find(ctx.profile.id)).toBeUndefined();
  });

  it("handles cancellation, wrong-profile polling, denial, expiry and unsafe verification URLs without saving tokens", async () => {
    const ctx = setup();
    ctx.fetch.mockResolvedValueOnce(json(device));
    let signIn = await ctx.service.begin(ctx.profile.id);
    await expect(ctx.service.poll(ctx.other.id, signIn.id)).rejects.toThrow(/another profile/);
    ctx.service.cancel(ctx.other.id, signIn.id);
    expect(ctx.service.verifyPending(ctx.profile.id, signIn.id)).toBe(signIn.userCode);
    expect(() => ctx.service.verifyPending(ctx.other.id, signIn.id)).toThrow(/another profile/);
    ctx.service.cancel(ctx.profile.id, signIn.id);
    await expect(ctx.service.poll(ctx.profile.id, signIn.id)).rejects.toThrow(/cancelled/);
    for (const error of ["access_denied", "expired_token", "device_flow_disabled"]) {
      ctx.fetch.mockResolvedValueOnce(json(device));
      signIn = await ctx.service.begin(ctx.profile.id);
      ctx.advance(5000);
      ctx.fetch.mockResolvedValueOnce(json({ error }));
      await expect(ctx.service.poll(ctx.profile.id, signIn.id)).rejects.toThrow();
    }
    ctx.fetch.mockResolvedValueOnce(json(device));
    signIn = await ctx.service.begin(ctx.profile.id);
    ctx.advance(900_001);
    await expect(ctx.service.poll(ctx.profile.id, signIn.id)).rejects.toThrow(/expired/);
    ctx.fetch.mockResolvedValueOnce(json({ ...device, verification_uri: "https://evil.invalid" }));
    await expect(ctx.service.begin(ctx.profile.id)).rejects.toThrow(/invalid device/);
    expect(ctx.values.size).toBe(0);
  });

  it("refuses missing app configuration, unavailable secure storage, oversized/error responses and tokens from an OAuth App registration", async () => {
    const ctx = setup(":memory:", "");
    await expect(ctx.service.begin(ctx.profile.id)).rejects.toThrow(/not configured/);
    expect(ctx.fetch).not.toHaveBeenCalled();
    const unavailable = new GitHubAuth(
      ctx.accounts,
      { ...ctx.secrets, available: false },
      "client",
      ctx.fetch,
    );
    await expect(unavailable.begin(ctx.profile.id)).rejects.toMatchObject({
      kind: "keychain-unavailable",
    });
    const ready = setup();
    ready.fetch.mockRejectedValueOnce(new Error("secret response ghu_do_not_leak"));
    await expect(ready.service.begin(ready.profile.id)).rejects.toThrow(/Could not reach GitHub/);
    ready.fetch.mockResolvedValueOnce(new Response("x".repeat(65 * 1024)));
    await expect(ready.service.begin(ready.profile.id)).rejects.toThrow(/supported size/);
    ready.fetch.mockResolvedValueOnce(json(device));
    const signIn = await ready.service.begin(ready.profile.id);
    ready.advance(5000);
    ready.fetch.mockResolvedValueOnce(
      json({ ...token, access_token: "gho_oauth_app_token", scope: "repo" }),
    );
    await expect(ready.service.poll(ready.profile.id, signIn.id)).rejects.toThrow(
      /invalid access token/,
    );
    expect(ready.values.size).toBe(0);
  });

  it("preserves an existing connection if sign-in is cancelled during account verification or persistence fails", async () => {
    const ctx = setup();
    await ctx.connect();
    const saved = ctx.accounts.find(ctx.profile.id);
    ctx.fetch.mockResolvedValueOnce(json(device)).mockResolvedValueOnce(json(token));
    const signIn = await ctx.service.begin(ctx.profile.id);
    ctx.advance(5000);
    ctx.fetch.mockImplementationOnce(async () => {
      ctx.service.cancel(ctx.profile.id, signIn.id);
      return json({ id: 8, login: "another-user" });
    });
    await expect(ctx.service.poll(ctx.profile.id, signIn.id)).rejects.toThrow(/cancelled/);
    expect(ctx.accounts.find(ctx.profile.id)).toEqual(saved);
    expect(ctx.values.size).toBe(1);
    const save = vi.spyOn(ctx.accounts, "save").mockImplementation(() => {
      throw new Error("DB unavailable");
    });
    await expect(ctx.connect()).rejects.toThrow("DB unavailable");
    save.mockRestore();
    expect(ctx.accounts.find(ctx.profile.id)).toEqual(saved);
    expect(ctx.values.size).toBe(1);
  });

  it("requires reconnect for expired/revoked refresh tokens but preserves connection state on a temporary network failure", async () => {
    const ctx = setup();
    await ctx.connect();
    ctx.advance(4_000_000);
    ctx.fetch.mockRejectedValueOnce(new Error("offline"));
    await expect(
      ctx.service.forFetch(ctx.profile.id, "https://github.com/org/repo"),
    ).rejects.toMatchObject({ kind: "network-failed" });
    expect(ctx.service.status(ctx.profile.id).account?.state).toBe("connected");
    ctx.fetch.mockResolvedValueOnce(json({ error: "bad_refresh_token" }));
    await expect(
      ctx.service.forFetch(ctx.profile.id, "https://github.com/org/repo"),
    ).rejects.toMatchObject({ kind: "github-auth-required" });
    expect(ctx.service.status(ctx.profile.id).account?.state).toBe("expired");
  });
});
