export interface GpgSigningKey {
  fingerprint: string;
  keyId: string;
  userIds: string[];
  signingFingerprints: string[];
  expiresAt: number | null;
}
