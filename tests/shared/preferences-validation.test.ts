import { expect, it } from "vitest";
import { emptyView, isView } from "@shared/identity/profile-session";
import { defaultFileView, isFileView } from "@shared/preferences/file-view";
import { builtInSetting, validateSetting } from "@shared/preferences/settings";

it("rejects saved selection areas that only coerce to valid strings", () => {
  for (const area of [["staged"], { toString: () => "staged" }]) {
    expect(isView({ ...emptyView(), selection: { kind: "change", path: "file", area } })).toBe(
      false,
    );
  }
});

it("rejects coerced file display modes and status filters", () => {
  const files = defaultFileView();
  expect(isFileView(files)).toBe(true);
  for (const mode of [["tree"], { toString: () => "tree" }])
    expect(isFileView({ ...files, mode })).toBe(false);
  for (const status of [[], ["M"], { toString: () => "M" }])
    expect(isFileView({ ...files, status })).toBe(false);
});

it("rejects theme modes that only coerce to a supported value", () => {
  const theme = builtInSetting("theme").value;
  for (const mode of [["system"], { toString: () => "system" }])
    expect(() => validateSetting("theme", { kind: "application" }, { ...theme, mode })).toThrow();
});

it("returns independent preference defaults for each caller", () => {
  const theme = builtInSetting("theme");
  theme.value.mode = "dark";
  expect(builtInSetting("theme").value.mode).toBe("system");
  const prefixes = builtInSetting("commitPrefixes").value;
  const expected = [...prefixes];
  prefixes.push("custom");
  expect(builtInSetting("commitPrefixes").value).toEqual(expected);
});
