import { createHash } from "node:crypto";
import type * as FileSystem from "node:fs/promises";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AvatarCache } from "@main/avatars/avatar-cache";

it("caches GitHub avatars by durable account ID across restarts using only the fixed public image host", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eda-github-avatar-"));
  const fetchImage = vi.fn<typeof fetch>(
    async () =>
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
  );
  try {
    const file = join(directory, "avatars");
    const cache = new AvatarCache(file, fetchImage);
    for (const invalid of ["../7", "7?redirect=evil", "https://evil.invalid", "", "0"])
      expect((await cache.getGitHub(invalid)).dataUrl).toBeNull();
    expect(fetchImage).not.toHaveBeenCalled();
    const [first, second] = await Promise.all([cache.getGitHub("7"), cache.getGitHub("7")]);
    expect(first).toEqual(second);
    expect(first.dataUrl).toBe("data:image/png;base64,AQID");
    expect(fetchImage).toHaveBeenCalledExactlyOnceWith(
      "https://avatars.githubusercontent.com/u/7?s=96&v=4",
      expect.objectContaining({ redirect: "error", credentials: "omit" }),
    );
    const imageFile = join(file, createHash("sha256").update("github:7").digest("hex"));
    expect(await readFile(imageFile)).toEqual(Buffer.from([1, 2, 3]));
    expect(await readFile(join(file, "index"), "utf8")).not.toContain("base64");
    const restarted = new AvatarCache(file, fetchImage);
    expect(await restarted.getGitHub("7")).toEqual(first);
    expect(fetchImage).toHaveBeenCalledOnce();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("deduplicates normalized authors, persists images across restarts, and refreshes expired entries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eda-avatars-"));
  let now = 1_000_000;
  const fetchImage = vi.fn<typeof fetch>(
    async () =>
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
  );
  const file = join(directory, "avatars");

  try {
    const cache = new AvatarCache(file, fetchImage, () => now);
    const [first, second] = await Promise.all([
      cache.get(" User@Example.com "),
      cache.get("user@example.com"),
    ]);

    expect(first).toEqual(second);
    expect(first.dataUrl).toBe("data:image/png;base64,AQID");
    expect(fetchImage).toHaveBeenCalledTimes(1);

    const url = String(fetchImage.mock.calls[0]![0]);

    expect(url).toMatch(/^https:\/\/www.gravatar.com\/avatar\/[a-f0-9]{64}\?/);
    expect(await readFile(join(file, "index"), "utf8")).not.toContain("user@example.com");

    const restarted = new AvatarCache(file, fetchImage, () => now);

    expect(await restarted.get("user@example.com")).toEqual(first);
    expect(fetchImage).toHaveBeenCalledTimes(1);

    now = first.expiresAt + 1;
    expect((await restarted.get("user@example.com")).expiresAt).toBeGreaterThan(now);
    expect(fetchImage).toHaveBeenCalledTimes(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("expires missing and failed lookups and rejects oversized or non-raster responses", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eda-avatars-"));
  let now = 1_000_000;
  const fetchImage = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }))
    .mockResolvedValueOnce(
      new Response(new Uint8Array(65 * 1024), { headers: { "content-type": "image/png" } }),
    );

  try {
    const file = join(directory, "avatars");

    await mkdir(file);
    await writeFile(join(file, "index"), "invalid cache");

    const cache = new AvatarCache(file, fetchImage, () => now);
    const missing = await cache.get("user@example.com");

    expect(missing.dataUrl).toBeNull();

    await cache.get("user@example.com");
    expect(fetchImage).toHaveBeenCalledTimes(1);

    now = missing.expiresAt + 1;

    const failed = await cache.get("user@example.com");

    expect(failed.dataUrl).toBeNull();
    expect(failed.expiresAt - now).toBeLessThan(missing.expiresAt - 1_000_000);

    now = failed.expiresAt + 1;
    expect((await cache.get("user@example.com")).dataUrl).toBeNull();
    expect((await cache.get("other@example.com")).dataUrl).toBeNull();
    expect(fetchImage).toHaveBeenCalledTimes(4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

it("coalesces concurrent distinct misses and persists every result before returning", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eda-avatar-batch-"));
  const fetchImage = vi.fn<typeof fetch>(async () => new Response(null, { status: 404 }));
  const file = join(directory, "avatars");
  vi.mocked(rename).mockClear();
  try {
    const cache = new AvatarCache(file, fetchImage);
    const emails = ["a", "b", "c", "d"].map((name) => `${name}@example.com`);
    await Promise.all(emails.map((email) => cache.get(email)));
    expect(JSON.parse(await readFile(join(file, "index"), "utf8"))).toHaveLength(4);
    expect(vi.mocked(rename).mock.calls.length).toBeLessThanOrEqual(4);
    const restarted = new AvatarCache(file, fetchImage);
    await Promise.all(emails.map((email) => restarted.get(email)));
    expect(fetchImage).toHaveBeenCalledTimes(4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("clears persisted and in-memory avatars before accepting fresh requests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eda-avatar-reset-"));
  const fetchImage = vi.fn<typeof fetch>(
    async () =>
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
  );
  try {
    const file = join(directory, "avatars");
    const cache = new AvatarCache(file, fetchImage);
    await cache.getGitHub("7");
    await cache.clear();
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
    await cache.getGitHub("7");
    expect(fetchImage).toHaveBeenCalledTimes(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("refetches a missing image", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eda-avatar-missing-"));
  const file = join(directory, "avatars");
  const fetchImage = vi.fn<typeof fetch>(
    async () => new Response(new Uint8Array([1]), { headers: { "content-type": "image/webp" } }),
  );
  try {
    await new AvatarCache(file, fetchImage).getGitHub("7");
    await rm(join(file, createHash("sha256").update("github:7").digest("hex")));
    await new AvatarCache(file, fetchImage).getGitHub("7");
    expect(fetchImage).toHaveBeenCalledTimes(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("cancels an unread missing-avatar response body", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eda-avatar-response-"));
  const cancel = vi.fn();
  const fetchImage = vi.fn<typeof fetch>(
    async () => new Response(new ReadableStream({ cancel }), { status: 404 }),
  );
  try {
    const cache = new AvatarCache(join(directory, "avatars"), fetchImage);
    expect((await cache.getGitHub("7")).dataUrl).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
