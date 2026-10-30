import { accountOwnerKey } from "@shared/identity/accounts";

export interface SecretStore {
  readonly available: boolean;
  readonly unavailableReason?: string | undefined;

  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  deleteForIdentity(identityId: string): Promise<void>;
}

export const secretKeys = {
  sshPassphrase: (identityId: string) => `identity:${identityId}:ssh-passphrase`,
  signingPassphrase: (identityId: string) => `identity:${identityId}:signing-passphrase`,
  identityPrefix: (identityId: string) => `identity:${identityId}:`,
  provider: (profileId: string, provider: string, host: string, accountId: string) => {
    return `identity:${profileId}:provider:${accountOwnerKey({ profileId, provider, host, accountId })}`;
  },
} as const;
