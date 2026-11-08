import { GitHubProfileCache } from "@main/providers/github-profile-cache";

const user = {
  id: 7,
  login: "YuzuZensai",
  name: "Yuzu",
  bio: "Hello\nGitHub",
  location: "Japan / Thailand",
  email: "private@example.test",
  avatar_url: "https://avatars.githubusercontent.com/u/7?v=4",
  access_token: "never-cache-this",
};

const details = {
  id: "7",
  login: user.login,
  name: user.name,
  bio: "Hello GitHub",
  location: user.location,
  avatarUrl: user.avatar_url,
};

it("deduplicates public profile lookups in memory and retains cached details when offline", async () => {
  let now = 1_000_000;
  const request = vi.fn<() => Promise<Record<string, unknown>>>(async () => user);
  const cache = new GitHubProfileCache(request, () => now);
  const account = { login: user.login };

  expect(await Promise.all([cache.get(account), cache.get(account)])).toEqual([details, details]);
  expect(request).toHaveBeenCalledExactlyOnceWith("https://api.github.com/users/YuzuZensai");

  expect(await cache.get(account)).toEqual(details);
  expect(request).toHaveBeenCalledOnce();

  now += 301_000;
  request.mockRejectedValue(new Error("offline"));

  expect(await cache.get(account)).toEqual(details);
  expect(request).toHaveBeenCalledTimes(2);

  expect(await cache.get(account)).toEqual(details);
  expect(request).toHaveBeenCalledTimes(2);

  const restarted = new GitHubProfileCache(request, () => now);

  expect(await restarted.get(account)).toBeNull();

  await cache.clear();

  expect(await cache.get(account)).toBeNull();
});

it("rejects unsafe lookup keys and profiles belonging to another account", async () => {
  const request = vi.fn(async () => ({ ...user, id: 8, login: "another-user" }));
  const cache = new GitHubProfileCache(request);

  expect(await cache.get({ login: "../users/7" })).toBeNull();
  expect(request).not.toHaveBeenCalled();

  expect(await cache.get({ login: user.login })).toBeNull();
  expect(await cache.get({ id: "7", login: user.login })).toEqual({
    ...details,
    name: null,
    bio: null,
    location: null,
    avatarUrl: null,
  });
});

it("replaces cached bio and location when GitHub clears those fields", async () => {
  let now = 1_000_000;
  const request = vi.fn(async (): Promise<Record<string, unknown>> => user);
  const cache = new GitHubProfileCache(request, () => now);
  const account = { id: "7", login: user.login };

  expect(await cache.get(account)).toEqual(details);

  now += 301_000;
  request.mockResolvedValueOnce({ ...user, bio: null, location: null });

  expect(await cache.get(account)).toEqual({ ...details, bio: null, location: null });
});
