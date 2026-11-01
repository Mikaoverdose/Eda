import { ERROR_CODE, errorText } from "@shared/error-codes";
import { AppError, errorMessage, GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { safeStorage } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SecretStore } from "./secret-store";
import { secretKeys } from "./secret-store";
import { isSecureStorageBackend } from "./storage-security";

export class KeychainSecretStore implements SecretStore {
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly vaultPath: string,
    readonly available: boolean,
    readonly unavailableReason?: string | undefined,
  ) {}

  static async create(vaultPath: string): Promise<KeychainSecretStore | UnavailableSecretStore> {
    if (!safeStorage.isEncryptionAvailable()) {
      return new UnavailableSecretStore(
        t("main.secrets.keychainSecretStore.noOsKeychainIsAvailableSoEdaCannot"),
      );
    }

    const backend =
      process.platform === "linux" ? safeStorage.getSelectedStorageBackend() : process.platform;

    if (!isSecureStorageBackend(process.platform, backend)) {
      return new UnavailableSecretStore(
        t("main.secrets.keychainSecretStore.linuxSafeStorageIsUsingBasicTextInstead"),
      );
    }

    try {
      const probe = safeStorage.encryptString("probe");
      if (safeStorage.decryptString(probe) !== "probe") {
        throw new AppError(ERROR_CODE.ENCRYPTION_VERIFICATION_FAILED);
      }
    } catch (error) {
      return new UnavailableSecretStore(
        t("main.secrets.keychainSecretStore.theSystemKeychainDidNotRespond", {
          value1: errorMessage(error),
        }),
      );
    }

    return new KeychainSecretStore(vaultPath, true);
  }

  async get(key: string): Promise<string | undefined> {
    await this.queue;

    const vault = await this.read();
    const encoded = vault[key];

    if (encoded === undefined) return undefined;

    try {
      return safeStorage.decryptString(Buffer.from(encoded, "base64"));
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: string): Promise<void> {
    return this.mutate(async () => {
      const vault = await this.read();
      vault[key] = safeStorage.encryptString(value).toString("base64");
      await this.write(vault);
    });
  }

  async delete(key: string): Promise<void> {
    return this.mutate(async () => {
      const vault = await this.read();
      if (!(key in vault)) return;
      delete vault[key];
      await this.write(vault);
    });
  }

  async deleteForIdentity(identityId: string): Promise<void> {
    return this.mutate(async () => {
      const prefix = secretKeys.identityPrefix(identityId);
      const vault = await this.read();
      let changed = false;

      for (const key of Object.keys(vault)) {
        if (key.startsWith(prefix)) {
          delete vault[key];
          changed = true;
        }
      }

      if (changed) await this.write(vault);
    });
  }

  async clear(): Promise<void> {
    await this.mutate(() => rm(this.vaultPath, { force: true }));
  }

  private mutate(work: () => Promise<void>): Promise<void> {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async read(): Promise<Record<string, string>> {
    if (!existsSync(this.vaultPath)) return {};

    try {
      const parsed: unknown = JSON.parse(await readFile(this.vaultPath, "utf8"));

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        !Object.values(parsed).every((value) => typeof value === "string")
      )
        throw new AppError(ERROR_CODE.INVALID_VAULT_FORMAT);

      return parsed as Record<string, string>;
    } catch {
      throw new GitError({
        kind: "keychain-unavailable",
        operation: t("operations.readCredentialVault"),
        message: errorText(
          "main.secrets.keychainSecretStore.theCredentialVaultCouldNotBeReadItsOriginalDataWasPreserved",
        ),
        suggestedAction: errorText(
          "main.secrets.keychainSecretStore.restoreAccessToTheVaultBeforeSavingCredentialsOrDeletingAProfile",
        ),
      });
    }
  }

  private async write(vault: Record<string, string>): Promise<void> {
    await mkdir(dirname(this.vaultPath), { recursive: true });

    const temporary = `${this.vaultPath}.${randomUUID()}.tmp`;

    try {
      await writeFile(temporary, JSON.stringify(vault), { mode: 0o600 });
      await rename(temporary, this.vaultPath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

export class UnavailableSecretStore implements SecretStore {
  readonly available = false;

  constructor(readonly unavailableReason: string) {}

  async get(): Promise<string | undefined> {
    return undefined;
  }

  async set(): Promise<void> {}

  async delete(): Promise<void> {}

  async deleteForIdentity(): Promise<void> {}

  async clear(): Promise<void> {}
}

export function vaultPathFor(userDataPath: string): string {
  return join(userDataPath, "secrets.vault");
}
