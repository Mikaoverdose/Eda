export type SshKeyType = "ED25519" | "RSA" | "ECDSA" | "DSA" | "UNKNOWN";

export interface SshHostPrompt {
  host: string;
  algorithm: string;
  fingerprint: string;
}

export interface SshHostTrustRequest extends SshHostPrompt {
  id: string;
}

export interface SshKey {
  path: string;
  publicKeyPath?: string;
  type: SshKeyType;
  bits: number;
  fingerprint: string;
  comment: string;
  publicKey?: string;
  encrypted: boolean;
  loadedInAgent: boolean;
}

export interface AgentKey {
  bits: number;
  fingerprint: string;
  comment: string;
  type: SshKeyType;
}

export type SshAgentMode = "builtin" | "system";

export type AgentStatus = (
  { available: true; keys: AgentKey[] } | { available: false; reason: string }
) & { source?: SshAgentMode };

export interface GenerateKeyRequest {
  path: string;
  type: "ed25519" | "rsa";
  comment: string;
  bits?: number;
}

export interface UnlockKeyRequest {
  keyPath: string;
  lifetimeSeconds?: number;
}

export interface UnlockCredentialRequest {
  lifetimeSeconds?: number;
  remember: boolean;
}

export interface SecretMetadata {
  available: boolean;
  remembered: boolean;
  reason?: string;
}

export interface ConnectionTestResult {
  status:
    | "authenticated"
    | "host-key-unknown"
    | "host-key-changed"
    | "host-key-unverified"
    | "key-rejected"
    | "unreachable"
    | "failed";
  reachable: boolean;
  authenticatedAs?: string;
  message: string;
}
