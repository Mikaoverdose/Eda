import type { SessionSnapshot } from "./profile-session";
import type { AccentColor } from "../preferences/accent";

export type SigningFormat = "ssh" | "gpg" | "none";

export interface SigningConfiguration {
  format: SigningFormat;
  keyRef?: string;
  signCommits: boolean;
}

export interface CommitIdentity {
  name: string;
  email: string;
}

/** Git removes these characters when saving an identity. */
export function isCommitIdentity(value: unknown): value is CommitIdentity {
  if (!value || typeof value !== "object") return false;
  const identity = value as CommitIdentity;
  return (
    typeof identity.name === "string" &&
    identity.name.length > 0 &&
    identity.name.length <= 128 &&
    identity.name.trim() === identity.name &&
    !/[<>\x00-\x1f\x7f]/.test(identity.name) &&
    typeof identity.email === "string" &&
    identity.email.length <= 254 &&
    /^[^\s<>@]+@[^\s<>@]+$/.test(identity.email) &&
    !/[\x00-\x1f\x7f]/.test(identity.email)
  );
}

export function profileGitConfig(identity: Identity): Record<string, string | undefined> {
  const signing = identity.signing;
  return {
    "user.name": identity.gitName,
    "user.email": identity.gitEmail,
    "gpg.format":
      signing.format === "none" ? undefined : signing.format === "gpg" ? "openpgp" : "ssh",
    "user.signingkey": signing.format === "none" ? undefined : signing.keyRef,
    "commit.gpgsign": signing.format !== "none" && signing.signCommits ? "true" : "false",
  };
}

export interface Identity {
  id: string;
  name: string;
  gitName: string;
  gitEmail: string;
  username?: string;
  avatarPath?: string;
  gravatarUrl?: string;
  hue: AccentColor;
  sshKeyPath?: string;
  signing: SigningConfiguration;
  rules: string[];
  createdAt: string;
  updatedAt: string;
}

export type IdentityDraft = Omit<Identity, "id" | "createdAt" | "updatedAt" | "gravatarUrl">;

export interface IdentityCreateOptions {
  syncGlobalGitConfig?: boolean;
}

export interface IdentitySwitchReport {
  identity: Identity;
  steps: IdentitySwitchStep[];
  verified: boolean;
  session?: SessionSnapshot;
}

export interface IdentitySwitchStep {
  name: "write-global-config" | "verify-read-back" | "write-signing-config" | "activate-ssh-key";
  status: "ok" | "failed" | "rolled-back" | "skipped";
  detail?: string;
}

export interface EffectiveIdentityCheck {
  matches: boolean;
  expected: CommitIdentity;
  actual: Partial<CommitIdentity>;
}
