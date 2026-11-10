import { createGitLabInsecureFetch } from "@main/providers/gitlab-insecure-fetch";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(async () => new Response("ok")),
  setCertificateVerifyProc:
    vi.fn<
      (verify: (request: { hostname: string }, callback: (code: number) => void) => void) => void
    >(),
  fromPartition: vi.fn(),
}));

vi.mock("electron", () => ({ session: { fromPartition: mocks.fromPartition } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fromPartition.mockReturnValue(mocks);
});

it("uses an isolated memory session and limits certificate exceptions to the instance host", () => {
  createGitLabInsecureFetch("https://git.company.test/gitlab");

  expect(mocks.fromPartition).toHaveBeenCalledWith(expect.stringMatching(/^gitlab-insecure:/), {
    cache: false,
  });

  const verify = mocks.setCertificateVerifyProc.mock.calls[0]![0];
  const result = vi.fn();
  verify({ hostname: "git.company.test" }, result);
  expect(result).toHaveBeenLastCalledWith(0);
  verify({ hostname: "other.company.test" }, result);
  expect(result).toHaveBeenLastCalledWith(-3);
});

it("blocks other origins and installation paths, and never follows redirects or sends cookies", async () => {
  const fetch = createGitLabInsecureFetch("https://git.company.test/gitlab");

  await fetch("https://git.company.test/gitlab/api/v4/user", {
    redirect: "follow",
    credentials: "include",
  });

  expect(mocks.fetch).toHaveBeenCalledWith(
    "https://git.company.test/gitlab/api/v4/user",
    expect.objectContaining({ redirect: "error", credentials: "omit" }),
  );

  mocks.fetch.mockClear();

  for (const url of [
    "https://other.company.test/gitlab/api/v4/user",
    "https://git.company.test/other/api/v4/user",
    "https://git.company.test/gitlab-other/api/v4/user",
    "http://git.company.test/gitlab/api/v4/user",
  ])
    await expect(fetch(url)).rejects.toMatchObject({ kind: "invalid-input" });

  expect(mocks.fetch).not.toHaveBeenCalled();
});
