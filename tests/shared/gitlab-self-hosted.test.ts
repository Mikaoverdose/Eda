import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  gitLabTokenSettingsUrl,
  isGitLabInstanceHttps,
  normalizeGitLabInstanceUrl,
} from "@shared/integrations/gitlab-self-hosted";

describe("GitLab instance URLs", () => {
  it.each([
    ["gitlab.company.test/gitlab/", "https://gitlab.company.test/gitlab"],
    [" HTTPS://GitLab.Company.Test/ ", "https://gitlab.company.test"],
    ["https://10.0.0.2", "https://10.0.0.2"],
    ["https://[::1]/gitlab", "https://[::1]/gitlab"],
    ["https://company.test/team/git-lab_1.2~/", "https://company.test/team/git-lab_1.2~"],
  ])("normalizes %s", (input, expected) =>
    expect(normalizeGitLabInstanceUrl(input)).toBe(expected),
  );

  it.each([
    "http://company.test",
    "https://user:token@company.test",
    "https://company.test?token=x",
    "https://company.test#",
    "https://company.test/a/../gitlab",
    "https://company.test/%2e%2e",
    "https://company.test\\evil",
    "https://company.test/path with space",
    "https://company.test//gitlab",
    "https://company.test/gitlab//",
    "https://company.test/group//gitlab",
    "https://company.test/gitlab!",
    "javascript:alert(1)",
    "https://gitlab.com",
    "https://gitlab.com.",
    "",
  ])("rejects unsafe or hosted instance %s", (url) =>
    expect(normalizeGitLabInstanceUrl(url)).toBeNull(),
  );

  it("rejects a near-limit malformed path without blocking URL validation", () => {
    const base = "https://company.test/";
    const valid = base + "-".repeat(2048 - base.length - 1);
    const moduleUrl = new URL(
      "../../src/shared/integrations/gitlab-self-hosted.ts",
      import.meta.url,
    );
    const result = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const { normalizeGitLabInstanceUrl } = await import(process.argv[1]);
         const valid = process.argv[2];
         console.log(JSON.stringify([
           normalizeGitLabInstanceUrl(valid),
           normalizeGitLabInstanceUrl(valid + "!"),
         ]));`,
        moduleUrl.href,
        valid,
      ],
      { encoding: "utf8", timeout: 5000 },
    );

    expect(JSON.parse(result)).toEqual([valid, null]);
  });

  it("matches only project remotes on the exact instance origin and base path", () => {
    const base = "https://git.company.test/gitlab";
    expect(isGitLabInstanceHttps(`${base}/group/subgroup/repo.git`, base)).toBe(true);
    expect(isGitLabInstanceHttps(`${base}/group/repo`, base)).toBe(true);

    for (const remote of [
      "https://other.company.test/gitlab/group/repo.git",
      "https://git.company.test/gitlab-other/group/repo.git",
      "https://git.company.test/other/group/repo.git",
      "https://git.company.test.evil.test/gitlab/group/repo.git",
      `${base}/group`,
      `${base}/group/repo.git?`,
      `${base}/group/repo.git#`,
      `${base}/group/../repo.git`,
      `${base}/group/%2e%2e/repo.git`,
      "https://user@git.company.test/gitlab/group/repo.git",
      "git@git.company.test:group/repo.git",
      "ssh://git.company.test/gitlab/group/repo.git",
    ])
      expect(isGitLabInstanceHttps(remote, base), remote).toBe(false);
  });
});

it.each([
  ["legacy", "/legacy/new"],
  ["granular", "/granular/new"],
  ["older", ""],
] as const)("opens the %s token form, retaining installation paths", (form, route) => {
  const url = new URL(gitLabTokenSettingsUrl("git.company.test/gitlab/", form)!);
  expect(url.origin).toBe("https://git.company.test");
  expect(url.pathname).toBe(`/gitlab/-/user_settings/personal_access_tokens${route}`);

  if (form === "granular") expect(url.search).toBe("");
  else {
    expect(url.searchParams.get("name")).toBe("Eda");
    expect(url.searchParams.get("scopes")).toBe("read_api,write_repository");
  }

  expect(gitLabTokenSettingsUrl("javascript:alert(1)")).toBeNull();
});
