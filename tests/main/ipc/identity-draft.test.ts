import { describe, expect, it } from "vitest";
import { GitError } from "@shared/errors";
import { parseDraft, parsePartialDraft } from "@main/ipc/identity-draft";

const valid = {
  name: "Work",
  gitName: "Eda",
  gitEmail: "eda@example.com",
  hue: 210,
};

describe("parseDraft", () => {
  it("accepts a minimal draft and defaults the optional parts", () => {
    const draft = parseDraft(valid);

    expect(draft).toMatchObject({
      name: "Work",
      gitName: "Eda",
      gitEmail: "eda@example.com",
      hue: 210,
    });
    expect(draft.signing).toEqual({ format: "none", signCommits: false });
    expect(draft.rules).toEqual([]);
  });

  it("carries optional fields through when present", () => {
    const draft = parseDraft({
      ...valid,
      username: "eda",
      avatarPath: "/avatars/eda.png",
      sshKeyPath: "/home/dev/.ssh/id_work",
      rules: ["~/Work/*"],
    });

    expect(draft).toMatchObject({
      username: "eda",
      avatarPath: "/avatars/eda.png",
      sshKeyPath: "/home/dev/.ssh/id_work",
      rules: ["~/Work/*"],
    });
  });

  it("parses ssh and gpg signing, and rejects an unknown format to none", () => {
    expect(
      parseDraft({ ...valid, signing: { format: "ssh", keyRef: "/k.pub", signCommits: true } })
        .signing,
    ).toEqual({ format: "ssh", keyRef: "/k.pub", signCommits: true });
    expect(
      parseDraft({ ...valid, signing: { format: "gpg", keyRef: "ABCD", signCommits: false } })
        .signing,
    ).toEqual({ format: "gpg", keyRef: "ABCD", signCommits: false });
    expect(parseDraft({ ...valid, signing: { format: "x509", keyRef: "k" } }).signing.format).toBe(
      "none",
    );
  });

  it("treats a non-true signCommits as false rather than truthy", () => {
    expect(
      parseDraft({ ...valid, signing: { format: "ssh", keyRef: "k", signCommits: "yes" } }).signing
        .signCommits,
    ).toBe(false);
  });

  it.each([null, undefined, "a string", 42, ["array"], true])(
    "rejects the non-object %s",
    (raw) => {
      expect(() => parseDraft(raw)).toThrow(GitError);
    },
  );

  it("rejects a missing or malformed required field", () => {
    expect(() => parseDraft({ ...valid, name: undefined })).toThrow(GitError);
    expect(() => parseDraft({ ...valid, gitEmail: "not-an-email" })).toThrow(GitError);
    expect(() => parseDraft({ ...valid, hue: "blue" })).toThrow(GitError);
  });

  it("rejects a rules value that is not a list of strings", () => {
    expect(() => parseDraft({ ...valid, rules: "not-a-list" })).toThrow(GitError);
    expect(() => parseDraft({ ...valid, rules: [1, 2] })).toThrow(GitError);
  });
});

describe("parsePartialDraft", () => {
  it("returns an empty draft when nothing was supplied", () => {
    expect(parsePartialDraft({})).toEqual({});
  });

  it("treats a non-object as no changes rather than throwing", () => {
    for (const raw of [null, undefined, "x", 42, ["a"]]) expect(parsePartialDraft(raw)).toEqual({});
  });

  it("includes only the fields actually present", () => {
    const draft = parsePartialDraft({ gitEmail: "new@example.com" });
    expect(draft).toEqual({ gitEmail: "new@example.com" });
  });

  it("still validates the fields it does receive", () => {
    expect(() => parsePartialDraft({ gitEmail: "nope" })).toThrow(GitError);
    expect(() => parsePartialDraft({ name: "" })).toThrow(GitError);
  });

  it("replaces signing wholesale when supplied", () => {
    expect(
      parsePartialDraft({ signing: { format: "gpg", keyRef: "ABCD", signCommits: true } }).signing,
    ).toEqual({ format: "gpg", keyRef: "ABCD", signCommits: true });
  });

  it("can clear the rules list", () => {
    expect(parsePartialDraft({ rules: [] }).rules).toEqual([]);
  });
});
