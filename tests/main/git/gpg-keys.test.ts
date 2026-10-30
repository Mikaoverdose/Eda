import { GpgKeyService, parseGpgSigningKeys } from "@main/git/security/gpg-keys";
import {
  ProcessSpawnError,
  type ProcessResult,
  type ProcessRunner,
} from "@main/git/execution/process-runner";

const primary = "ECAF7590EB3443B5C7CF3ACB6C7EE1B8621CC013";
const subkey = "CF8BCC4B18DE08FCD8A1615906AD222CADF6A6E1";
const now = 1_800_000_000;

// GnuPG's doc/DETAILS defines these indexes; field 15 marks secret-key availability.
function record(type: string, fields: Record<number, string> = {}) {
  const columns = Array<string>(18).fill("");
  columns[0] = type;
  for (const [index, value] of Object.entries(fields)) columns[Number(index)] = value;
  return columns.join(":");
}

const secret = (fields: Record<number, string> = {}) =>
  record("sec", { 1: "u", 4: primary.slice(-16), 11: "scSC", 14: "+", ...fields });
const fingerprint = (value: string) => record("fpr", { 9: value });

it("reads public identities and fingerprints from secret-key listings without leaking protocol escapes", () => {
  const output = [
    record("tru"),
    secret({ 6: String(now + 1000) }),
    fingerprint(primary),
    record("uid", { 1: "u", 9: "Work\\x3a Ren\\xc3\\xa9 <work@example.com>" }),
    record("uid", { 1: "r", 9: "Revoked <old@example.com>" }),
    record("uid", { 1: "u", 9: "Literal \\\\x3a\\n<other@example.com>" }),
    record("future-record", { 9: "ignored" }),
  ].join("\r\n");

  expect(parseGpgSigningKeys(output, now)).toEqual([
    {
      fingerprint: primary,
      keyId: primary.slice(-16),
      userIds: ["Work: René <work@example.com>", "Literal \\x3a <other@example.com>"],
      signingFingerprints: [primary],
      expiresAt: now + 1000,
    },
  ]);
});

it("offers a usable signing subkey even when the certification-only primary is offline", () => {
  const output = [
    secret({ 11: "cSC", 14: "#" }),
    fingerprint(primary),
    record("uid", { 9: "Work <work@example.com>" }),
    record("ssb", { 11: "s", 14: "card-serial" }),
    fingerprint(subkey),
  ].join("\n");

  expect(parseGpgSigningKeys(output, now)).toMatchObject([
    { fingerprint: primary, signingFingerprints: [subkey] },
  ]);
  expect(parseGpgSigningKeys(output.replace("card-serial", "#"), now)).toEqual([]);
});

it("excludes expired, revoked, disabled, missing-secret and non-signing keys without mixing key groups", () => {
  const unavailable = [
    { 1: "r" },
    { 1: "e" },
    { 6: String(now - 1) },
    { 11: "scSCD" },
    { 14: "#" },
    { 11: "e" },
  ];

  const output = [
    ...unavailable.flatMap((fields) => [secret(fields), fingerprint(primary)]),
    secret({ 11: "cSC" }),
    fingerprint(primary),
    record("ssb", { 6: String(now - 1), 11: "s", 14: "+" }),
    fingerprint(subkey),
    secret(),
    fingerprint("invalid"),
    secret(),
    fingerprint(subkey),
    record("uid", { 9: "Available" }),
  ].join("\n");

  expect(parseGpgSigningKeys(output, now)).toMatchObject([
    { fingerprint: subkey, userIds: ["Available"] },
  ]);
});

function service(run: ProcessRunner["run"]) {
  return new GpgKeyService({ run }, { readConfig: async () => undefined });
}

const result = (overrides: Partial<ProcessResult> = {}): ProcessResult => ({
  exitCode: 0,
  cancelled: false,
  stdout: Buffer.from(`${secret()}\n${fingerprint(primary)}`),
  stderr: Buffer.alloc(0),
  ...overrides,
});

it("distinguishes an empty keyring from an unavailable GPG executable", async () => {
  expect(await service(async () => result({ stdout: Buffer.alloc(0) })).listSigningKeys()).toEqual(
    [],
  );

  const missing = service(async () => {
    throw new ProcessSpawnError("gpg", Object.assign(new Error("missing"), { code: "ENOENT" }));
  });

  await expect(missing.listSigningKeys()).rejects.toMatchObject({
    kind: "git-not-found",
    message: "GPG is unavailable.",
  });
});

it("rejects timed-out, failed and truncated results instead of offering a partial key list", async () => {
  for (const failure of [
    { cancelled: true },
    { exitCode: 2 },
    { outputLimitExceeded: "stdout" as const },
  ]) {
    await expect(service(async () => result(failure)).listSigningKeys()).rejects.toMatchObject({
      operation: "detect GPG signing keys",
    });
  }
});

it("uses the configured OpenPGP executable and inherited keyring through a bounded process adapter", async () => {
  const run = vi.fn<ProcessRunner["run"]>(async () => result());
  const configured = new GpgKeyService(
    { run },
    {
      readConfig: async (key) =>
        key === "gpg.openpgp.program" ? "/installed GnuPG/gpg" : "/other/gpg",
    },
    { GNUPGHOME: "/keyring" },
  );

  await configured.listSigningKeys();

  const request = run.mock.calls[0]![0];

  expect(request.executable).toBe("/installed GnuPG/gpg");
  expect(request.env["GNUPGHOME"]).toBe("/keyring");
  expect(request.args).toContain("--list-secret-keys");
  expect(request.signal).toBeInstanceOf(AbortSignal);
  expect(request.maxStdoutBytes).toBeGreaterThan(0);
  expect(request.maxStderrBytes).toBeGreaterThan(0);
});
