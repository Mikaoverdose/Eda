import type { AgentKey, SshKeyType } from "@shared/identity/ssh";

const KEY_TYPES: readonly SshKeyType[] = ["ED25519", "RSA", "ECDSA", "DSA"];

export type ParsedKeyLine = AgentKey;

export function parseKeyLine(line: string): ParsedKeyLine | undefined {
  const trimmed = line.trim();

  if (trimmed.length === 0) return undefined;

  const head = /^(\d+)\s+(\S+)\s*/.exec(trimmed);

  if (!head) return undefined;

  const tail = /\(([^)]+)\)$/.exec(trimmed);

  const bits = Number(head[1]);
  const fingerprint = head[2]!;
  const rawType = tail?.[1]?.toUpperCase() ?? "";

  const comment = trimmed
    .slice(head[0].length, tail ? trimmed.length - tail[0].length : undefined)
    .trim();

  return {
    bits,
    fingerprint,
    comment,
    type: KEY_TYPES.includes(rawType as SshKeyType) ? (rawType as SshKeyType) : "UNKNOWN",
  };
}

export function parseAgentList(stdout: string): AgentKey[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^the agent has no identities/i.test(line))
    .map(parseKeyLine)
    .filter((key): key is ParsedKeyLine => key !== undefined);
}

export function isEmptyAgentOutput(output: string): boolean {
  return /the agent has no identities/i.test(output);
}

export function isAgentUnreachable(output: string): boolean {
  return /could not open a connection to your authentication agent|error connecting to agent/i.test(
    output,
  );
}

export interface ParsedPublicKey {
  publicKey: string;
  type: SshKeyType;
  comment: string;
}

export function parsePublicKey(contents: string): ParsedPublicKey | undefined {
  const line = contents
    .split("\n")
    .find((l) => l.trim().length > 0)
    ?.trim();

  if (!line) return undefined;

  const parts = line.split(/\s+/);
  const algorithm = parts[0];
  const body = parts[1];

  if (!algorithm || !body || (!algorithm.startsWith("ssh-") && !algorithm.startsWith("ecdsa-"))) {
    return undefined;
  }

  return {
    publicKey: line,
    type: algorithmToType(algorithm),
    comment: parts.slice(2).join(" "),
  };
}

function algorithmToType(algorithm: string): SshKeyType {
  if (algorithm.includes("ed25519")) return "ED25519";
  if (algorithm.includes("rsa")) return "RSA";
  if (algorithm.includes("ecdsa")) return "ECDSA";
  if (algorithm.includes("dss") || algorithm.includes("dsa")) return "DSA";
  return "UNKNOWN";
}

export function isEncryptedFromProbe(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`;
  return /incorrect passphrase|passphrase is required|load key .* bad (passphrase|permissions)/i.test(
    combined,
  );
}

export function parseAuthenticatedUser(output: string): string | undefined {
  const github = /\bHi ([A-Za-z0-9._-]+)[!,]/.exec(output);

  if (github) return github[1];

  const gitlab = /Welcome to GitLab, @([A-Za-z0-9._-]+)!/.exec(output);

  if (gitlab) return gitlab[1];

  const bitbucket = /logged in as ([A-Za-z0-9._-]+)/i.exec(output);

  if (bitbucket) return bitbucket[1];

  return undefined;
}
