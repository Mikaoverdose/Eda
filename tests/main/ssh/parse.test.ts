import { describe, expect, it } from "vitest";
import { sshFixtures as fx } from "../../fixtures/ssh-output";
import {
  isAgentUnreachable,
  isEmptyAgentOutput,
  isEncryptedFromProbe,
  parseAgentList,
  parseAuthenticatedUser,
  parseKeyLine,
  parsePublicKey,
} from "@main/ssh/parse";

describe("parseKeyLine", () => {
  it("parses an ed25519 fingerprint line", () => {
    expect(parseKeyLine(fx.fingerprintEd25519)).toEqual({
      bits: 256,
      fingerprint: "SHA256:HW9RqUZzUcV77QKLbkDAI5pzoivy7Oz/wm0oiGIBj4Y",
      comment: "test@eda.invalid",
      type: "ED25519",
    });
  });

  it("parses an RSA fingerprint line", () => {
    const parsed = parseKeyLine(fx.fingerprintRsa);
    expect(parsed?.type).toBe("RSA");
    expect(parsed?.bits).toBe(2048);
  });

  it("parses an MD5 fingerprint without mistaking it for a comment", () => {
    const parsed = parseKeyLine(fx.fingerprintMd5);
    expect(parsed?.fingerprint).toBe("MD5:76:6d:06:2b:15:77:9b:2d:bd:81:e9:6c:d1:7f:02:5d");
    expect(parsed?.comment).toBe("test@eda.invalid");
  });

  it("keeps a comment containing spaces intact", () => {
    const parsed = parseKeyLine("256 SHA256:abc Eda work laptop (ED25519)");
    expect(parsed?.comment).toBe("Eda work laptop");
  });

  it("handles a key with no comment", () => {
    const parsed = parseKeyLine("256 SHA256:abc (ED25519)");
    expect(parsed?.comment).toBe("");
    expect(parsed?.type).toBe("ED25519");
  });

  it("returns undefined for a line that is not a key", () => {
    expect(parseKeyLine("")).toBeUndefined();
    expect(parseKeyLine("The agent has no identities.")).toBeUndefined();
  });
});

describe("parseAgentList", () => {
  it("parses a single loaded key", () => {
    expect(parseAgentList(fx.agentOneKey)).toHaveLength(1);
  });

  it("parses several keys, which is the identity-separation case", () => {
    const keys = parseAgentList(fx.agentTwoKeys);
    expect(keys.map((k) => k.comment)).toEqual(["work@eda.invalid", "personal@eda.invalid"]);
  });

  it("treats an empty agent as an empty list, not an error", () => {
    expect(parseAgentList(fx.agentEmpty)).toEqual([]);
    expect(isEmptyAgentOutput(fx.agentEmpty)).toBe(true);
  });

  it("distinguishes no agent running from an agent holding nothing", () => {
    expect(isAgentUnreachable(fx.agentUnreachable)).toBe(true);
    expect(isAgentUnreachable(fx.agentEmpty)).toBe(false);
  });
});

describe("parsePublicKey", () => {
  it("parses an ed25519 public key file", () => {
    const parsed = parsePublicKey(fx.publicKeyEd25519);
    expect(parsed?.type).toBe("ED25519");
    expect(parsed?.comment).toBe("test@eda.invalid");
    expect(parsed?.publicKey).toBe(fx.publicKeyEd25519);
  });

  it("keeps a spaced comment intact", () => {
    expect(parsePublicKey(fx.publicKeyWithSpacedComment)?.comment).toBe("Eda work laptop");
  });

  it("rejects content that is not a public key", () => {
    expect(parsePublicKey("-----BEGIN OPENSSH PRIVATE KEY-----")).toBeUndefined();
    expect(parsePublicKey("")).toBeUndefined();
  });
});

describe("isEncryptedFromProbe", () => {
  it("detects a passphrase-protected key", () => {
    expect(isEncryptedFromProbe("", fx.probeEncrypted)).toBe(true);
  });

  it("detects an unencrypted key", () => {
    expect(isEncryptedFromProbe(fx.probeUnencrypted, "")).toBe(false);
  });

  it("does not call an unreadable key encrypted", () => {
    expect(isEncryptedFromProbe("", fx.probeUnreadable)).toBe(false);
  });
});

describe("parseAuthenticatedUser", () => {
  it("reads the username from a GitHub greeting", () => {
    expect(parseAuthenticatedUser(fx.githubGreeting)).toBe("eda");
  });

  it("reads the username from a GitLab greeting", () => {
    expect(parseAuthenticatedUser(fx.gitlabGreeting)).toBe("eda");
  });

  it("returns undefined when the host says nothing recognizable", () => {
    expect(parseAuthenticatedUser("Permission denied (publickey).")).toBeUndefined();
  });
});
