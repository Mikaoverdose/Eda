import { resolveGpgSelection, type GpgSigningKey } from "@shared/identity/signing";

const primary = "0123456789ABCDEF0123456789ABCDEF01234567";
const subkey = "89ABCDEF89ABCDEF89ABCDEF89ABCDEF89ABCDEF";
const identity: GpgSigningKey = {
  fingerprint: primary,
  keyId: primary.slice(-16),
  userIds: ["Author <work@example.com>"],
  signingKeys: [{ fingerprint: subkey, expiresAt: null }],
  expiresAt: null,
};

it("distinguishes identity selection from an exact signer with an offline primary", () => {
  for (const value of [primary, primary.slice(-16), `0x${primary.toLowerCase()}`, subkey]) {
    expect(resolveGpgSelection(value, [identity])).toEqual({ identity, signer: undefined });
  }
  expect(resolveGpgSelection(`${subkey}!`, [identity])).toEqual({
    identity,
    signer: identity.signingKeys[0],
  });
  expect(resolveGpgSelection(`${primary}!`, [identity])).toBeUndefined();
});

it("does not misidentify ambiguous short IDs or unknown selectors", () => {
  const collision = "A".repeat(24) + subkey.slice(-16);
  const keys = [
    {
      ...identity,
      signingKeys: [...identity.signingKeys, { fingerprint: collision, expiresAt: null }],
    },
  ];
  expect(resolveGpgSelection(subkey.slice(-16), keys)).toBeUndefined();
  expect(resolveGpgSelection(`${subkey.slice(-16)}!`, keys)).toBeUndefined();
  for (const value of ["", "someone@example.com", "UNKNOWN", "12345678"]) {
    expect(resolveGpgSelection(value, keys)).toBeUndefined();
  }
  expect(resolveGpgSelection(`${subkey}!`, keys)?.signer?.fingerprint).toBe(subkey);
});
