export interface GpgSigningKey {
  fingerprint: string;
  keyId: string;
  userIds: string[];
  signingKeys: { fingerprint: string; expiresAt: number | null }[];
  expiresAt: number | null;
}

export function resolveGpgSelection(value: string, keys: GpgSigningKey[]) {
  const configured = value.replace(/^0x/i, "").replace(/!$/, "").toUpperCase();
  if (!/^[\dA-F]{8,64}$/.test(configured)) return undefined;

  const matches = keys.flatMap((identity) => {
    const fingerprints = new Set([
      identity.fingerprint,
      ...identity.signingKeys.map((key) => key.fingerprint),
    ]);
    return [...fingerprints]
      .filter((fingerprint) => fingerprint.endsWith(configured))
      .map((fingerprint) => ({ identity, fingerprint }));
  });
  if (matches.length !== 1) return undefined;

  const match = matches[0]!;
  if (!value.endsWith("!")) return { identity: match.identity, signer: undefined };

  const signer = match.identity.signingKeys.find((key) => key.fingerprint === match.fingerprint);
  return signer ? { identity: match.identity, signer } : undefined;
}
