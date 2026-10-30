import { afterEach, expect, it, vi } from "vitest";
import { safeStorage } from "electron";
import { KeychainSecretStore } from "@main/secrets/keychain-secret-store";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { secretKeys } from "@main/secrets/secret-store";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) => Buffer.from(value)),
    decryptString: vi.fn((value: Buffer) => value.toString()),
    getSelectedStorageBackend: vi.fn(),
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each(["win32", "darwin"] as const)(
  "starts secure storage on %s without calling the Linux-only backend API",
  async (platform) => {
    vi.stubGlobal("process", { platform });
    vi.mocked(safeStorage.getSelectedStorageBackend).mockImplementation(() => {
      throw new Error("Linux only");
    });

    const vault = await KeychainSecretStore.create("/unused/vault");

    expect(vault.available).toBe(true);
    expect(safeStorage.getSelectedStorageBackend).not.toHaveBeenCalled();
  },
);

it.each([
  ["basic_text", false],
  ["gnome_libsecret", true],
] as const)("reports Linux %s availability as %s", async (backend, available) => {
  vi.stubGlobal("process", { platform: "linux" });
  vi.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue(backend);
  const vault = await KeychainSecretStore.create("/unused/vault");
  expect(vault.available).toBe(available);
});

it("serializes vault changes, isolates same-host accounts, and deletes only one profile namespace", async () => {
  vi.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue("gnome_libsecret");

  const root = await mkdtemp(join(tmpdir(), "eda-vault-"));

  try {
    const vault = await KeychainSecretStore.create(join(root, "vault"));
    const one = secretKeys.provider("work", "github", "GITHUB.COM", "one");

    expect(one).toBe(secretKeys.provider("work", "github", "github.com.", "one"));

    const two = secretKeys.provider("work", "github", "github.com", "two");
    const other = secretKeys.provider("home", "github", "github.com", "one");

    await Promise.all([
      vault.set(one, "one secret"),
      vault.set(two, "two secret"),
      vault.set(other, "home secret"),
    ]);
    expect(await vault.get(one)).toBe("one secret");
    expect(await vault.get(two)).toBe("two secret");

    await vault.deleteForIdentity("work");
    expect(await vault.get(one)).toBeUndefined();
    expect(await vault.get(two)).toBeUndefined();
    expect(await vault.get(other)).toBe("home secret");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("refuses to overwrite an unreadable vault during profile deletion or credential save", async () => {
  vi.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue("gnome_libsecret");

  const root = await mkdtemp(join(tmpdir(), "eda-vault-"));

  try {
    const path = join(root, "vault");

    await writeFile(path, "{damaged");

    const vault = await KeychainSecretStore.create(path);

    await expect(vault.deleteForIdentity("work")).rejects.toMatchObject({
      kind: "keychain-unavailable",
    });
    await expect(vault.set("identity:home:ssh-passphrase", "secret")).rejects.toThrow(/preserved/);
    expect(await readFile(path, "utf8")).toBe("{damaged");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("clears queued vault writes and allows new credentials after a reset", async () => {
  const root = await mkdtemp(join(tmpdir(), "eda-vault-reset-"));
  try {
    const path = join(root, "vault");
    const vault = await KeychainSecretStore.create(path);
    const pending = vault.set("old", "secret");
    await vault.clear();
    await pending;
    expect(await vault.get("old")).toBeUndefined();
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
    await vault.set("new", "fresh");
    expect(await vault.get("new")).toBe("fresh");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
