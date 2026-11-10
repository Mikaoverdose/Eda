import { referenceLink } from "@shared/repository/reference-link";

describe("reference browser links", () => {
  it("strips credentials and encodes branch names without carrying query tokens", () => {
    expect(
      referenceLink(
        "https://user:secret@github.com/org/repo.git?token=secret",
        "branch",
        "feature/one",
      ),
    ).toBe("https://github.com/org/repo/tree/feature%2Fone");

    expect(referenceLink("git@gitlab.com:group/sub/repo.git", "tag", "v1")).toBe(
      "https://gitlab.com/group/sub/repo/-/tree/v1",
    );

    expect(referenceLink("ssh://git@bitbucket.org/team/repo.git", "commit", "abcd")).toBe(
      "https://bitbucket.org/team/repo/commits/abcd",
    );
  });

  it("does not guess unknown provider routes or accept executable links", () => {
    for (const url of ["javascript:alert(1)", "file:///repo", "https://unknown.example/org/repo"])
      expect(referenceLink(url, "branch", "main")).toBeNull();
  });
});

it("builds GitLab links for configured HTTPS instances, including base paths", () => {
  const base = "https://git.company.test/gitlab";
  const remote = `${base}/team/subgroup/repo.git`;

  expect(referenceLink(remote, "commit", "abc123", [base])).toBe(
    `${base}/team/subgroup/repo/-/commit/abc123`,
  );

  expect(referenceLink(remote, "branch", "feature/work", [base])).toBe(
    `${base}/team/subgroup/repo/-/tree/feature%2Fwork`,
  );

  expect(referenceLink(remote, "commit", "abc123")).toBeNull();
  expect(referenceLink(remote, "commit", "abc123", ["https://other.company.test"])).toBeNull();
});
