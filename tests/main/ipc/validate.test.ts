import { describe, expect, it } from "vitest";
import { GitError } from "@shared/errors";
import {
  optionalInteger,
  optionalString,
  requireAbsolutePath,
  requireEmail,
  requireHue,
  requireId,
  requireString,
  requireStringArray,
} from "@main/ipc/validate";

const rejects = (fn: () => unknown) => {
  expect(fn).toThrow(GitError);

  try {
    fn();
  } catch (error) {
    expect((error as GitError).kind).toBe("invalid-input");
    expect((error as GitError).suggestedAction).toBeTruthy();
  }
};

describe("requireString", () => {
  it("accepts ordinary text", () => {
    expect(requireString("hello", "field")).toBe("hello");
  });

  it("rejects non-strings, including numbers and objects", () => {
    for (const value of [42, null, undefined, {}, [], true])
      rejects(() => requireString(value, "field"));
  });

  it("rejects an empty string", () => {
    rejects(() => requireString("", "field"));
  });

  it("enforces the maximum length", () => {
    expect(requireString("abc", "field", 3)).toBe("abc");
    rejects(() => requireString("abcd", "field", 3));
  });

  it("rejects a null byte, which would truncate the value passed to Git", () => {
    rejects(() => requireString("safe\0--evil", "field"));
  });

  it("does not leak the value into the error message", () => {
    try {
      requireString("hunter2-secret", "field", 4);
    } catch (error) {
      expect((error as GitError).message).not.toContain("hunter2-secret");
    }
  });
});

describe("requireId", () => {
  it("accepts a uuid in either case", () => {
    const id = "3d7cbfac-c122-4457-9e8c-5040dbb7832f";
    expect(requireId(id)).toBe(id);
    expect(requireId(id.toUpperCase())).toBe(id.toUpperCase());
  });

  it("rejects anything that is not uuid-shaped", () => {
    for (const value of ["", "not-a-uuid", "../../etc/passwd", "3d7cbfac", `${"a".repeat(37)}`]) {
      rejects(() => requireId(value));
    }
  });

  it("rejects a uuid with a SQL fragment appended", () => {
    rejects(() => requireId("3d7cbfac-c122-4457-9e8c-5040dbb7832f' OR '1'='1"));
  });
});

describe("requireAbsolutePath", () => {
  it("accepts posix and windows absolute paths", () => {
    expect(requireAbsolutePath("/home/dev/repo")).toBe("/home/dev/repo");
    expect(requireAbsolutePath("C:\\Users\\dev\\repo")).toBe("C:\\Users\\dev\\repo");
    expect(requireAbsolutePath("D:/repos/eda")).toBe("D:/repos/eda");
  });

  it("rejects a relative path", () => {
    rejects(() => requireAbsolutePath("repo"));
    rejects(() => requireAbsolutePath("./repo"));
    rejects(() => requireAbsolutePath("../repo"));
  });

  it("rejects a null byte inside an otherwise absolute path", () => {
    rejects(() => requireAbsolutePath("/home/dev\0/evil"));
  });
});

describe("requireEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(requireEmail("dev@example.com")).toBe("dev@example.com");
    expect(requireEmail("a.b+tag@sub.example.co.uk")).toBe("a.b+tag@sub.example.co.uk");
  });

  it("rejects addresses without a domain dot or with whitespace", () => {
    for (const value of ["eda", "dev@", "@example.com", "dev@example", "a b@example.com"]) {
      rejects(() => requireEmail(value));
    }
  });
});

describe("requireHue", () => {
  it("keeps a hue already inside the circle", () => {
    expect(requireHue(210)).toBe(210);
    expect(requireHue(0)).toBe(0);
  });

  it("wraps values outside 0-359 back onto the circle", () => {
    expect(requireHue(360)).toBe(0);
    expect(requireHue(400)).toBe(40);
    expect(requireHue(-30)).toBe(330);
  });

  it("rejects non-finite and non-numeric hues", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, "210", null])
      rejects(() => requireHue(value));
  });
});

describe("optionalString", () => {
  it("treats undefined, null, and empty string as absent", () => {
    for (const value of [undefined, null, ""])
      expect(optionalString(value, "field")).toBeUndefined();
  });

  it("validates the value when one is present", () => {
    expect(optionalString("value", "field")).toBe("value");
    rejects(() => optionalString("toolong", "field", 3));
  });
});

describe("requireStringArray", () => {
  it("accepts an array of strings", () => {
    expect(requireStringArray(["a", "b"], "paths")).toEqual(["a", "b"]);
  });

  it("accepts an empty array", () => {
    expect(requireStringArray([], "paths")).toEqual([]);
  });

  it("rejects a non-array, including a bare string", () => {
    for (const value of ["a", 42, null, {}]) rejects(() => requireStringArray(value, "paths"));
  });

  it("enforces the item cap so one request cannot spawn an unbounded argv", () => {
    expect(
      requireStringArray(
        Array.from({ length: 3 }, () => "a"),
        "paths",
        3,
      ),
    ).toHaveLength(3);

    rejects(() =>
      requireStringArray(
        Array.from({ length: 4 }, () => "a"),
        "paths",
        3,
      ),
    );
  });

  it("rejects an array containing a non-string, naming the index", () => {
    try {
      requireStringArray(["ok", 42], "paths");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as GitError).message).toContain("paths[1]");
    }
  });
});

describe("optionalInteger", () => {
  it("returns undefined when absent", () => {
    expect(optionalInteger(undefined, "limit", 1, 200)).toBeUndefined();
  });

  it("accepts values on the inclusive boundaries", () => {
    expect(optionalInteger(1, "limit", 1, 200)).toBe(1);
    expect(optionalInteger(200, "limit", 1, 200)).toBe(200);
  });

  it("rejects values outside the range", () => {
    rejects(() => optionalInteger(0, "limit", 1, 200));
    rejects(() => optionalInteger(201, "limit", 1, 200));
  });

  it("rejects fractions and non-numbers, so no NaN reaches a Git argument", () => {
    for (const value of [1.5, Number.NaN, "10", null])
      rejects(() => optionalInteger(value, "limit", 1, 200));
  });
});
