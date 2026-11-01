import { errorFixture } from "../../../../helpers/error";
import { act } from "react";
import { useShellStore } from "@renderer/stores/shell-store";
import { createRoot, type Root } from "react-dom/client";
import { ok, err } from "@shared/errors";
import { RepositorySyncActions } from "@renderer/features/sync/RepositorySyncActions";
import { useDirectPull } from "@renderer/features/sync/hooks/useDirectPull";
import { useAppStore } from "@renderer/stores/app-store";
import { useRepositoryStore } from "@renderer/stores/repository-store";

let root: Root;
let container: HTMLDivElement;
let api: ReturnType<typeof useDirectPull>;
const prepared = { token: "pinned", strategy: "ff-only", ahead: 0, behind: 1 };
const prepare = vi.fn();
const execute = vi.fn();
const preference = vi.fn();
const inspect = vi.fn();

function Harness() {
  api = useDirectPull("repo");
  return null;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useAppStore.setState({
    selectedRepositoryId: "repo",
    activeIdentity: { id: "profile" } as never,
  });
  vi.spyOn(useRepositoryStore.getState(), "syncFromDisk").mockResolvedValue();
  prepare.mockReset().mockResolvedValue(ok(prepared));
  execute.mockReset().mockResolvedValue(ok("Pull completed."));
  preference.mockReset().mockResolvedValue(ok({ value: "ff-only" }));
  inspect.mockReset().mockResolvedValue(
    ok({
      branches: [{ isHead: true, upstream: "origin/main" }],
      remotes: [{ name: "origin", fetchUrls: ["https://example.com/repo"] }],
    }),
  );
  vi.stubGlobal("eda", { pull: { prepare, execute, preference }, remotes: { inspect } });
  useRepositoryStore.setState({
    repositoryId: "repo",
    identityId: "profile",
    phase: "ready",
    writing: false,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("pulls immediately using the saved default and applies the pinned upstream", async () => {
  await act(async () => api.pull());
  expect(prepare).toHaveBeenCalledWith({ repositoryId: "repo", strategy: "ff-only" });
  expect(execute).toHaveBeenCalledWith("repo", "pinned");
  expect(api.message).toBe("Pull completed.");
});

it("uses the dropdown strategy for this pull without changing the default", async () => {
  await act(async () => api.pull("rebase"));
  expect(preference).not.toHaveBeenCalled();
  expect(prepare).toHaveBeenCalledWith({ repositoryId: "repo", strategy: "rebase" });
});

it("does not execute a blocked fast-forward-only pull", async () => {
  prepare.mockResolvedValue(ok({ ...prepared, blockedReason: "The branches have diverged." }));
  await act(async () => api.pull());
  expect(execute).not.toHaveBeenCalled();
  expect(api.error).toContain("diverged");
});

it("requests HTTPS credentials only after auth failure and retries with the same strategy", async () => {
  prepare.mockResolvedValueOnce(
    err(
      errorFixture({ kind: "auth-failed", operation: "fetch", message: "Authentication failed" }),
    ),
  );
  await act(async () => api.pull("rebase"));
  expect(api.authentication).toBe("rebase");
  expect(execute).not.toHaveBeenCalled();
  const credentials = { username: "user", password: "token" };
  await act(async () => api.pull(api.authentication!, credentials));
  expect(prepare).toHaveBeenLastCalledWith({
    repositoryId: "repo",
    strategy: "rebase",
    credentials,
  });
  expect(api.authentication).toBeNull();
  expect(execute).toHaveBeenCalledOnce();
});

it.each(["github-auth-required", "github-access-required"] as const)(
  "routes %s to GitHub settings and preserves the chosen pull strategy",
  async (kind) => {
    prepare.mockResolvedValueOnce(
      err({ kind, operation: "fetch", message: "Sign in with GitHub" }),
    );
    await act(async () => api.pull("rebase"));
    expect(api.githubAuthentication).toBe("rebase");
    expect(api.githubAccessDenied).toBe(kind === "github-access-required");
    expect(api.authentication).toBeNull();
    expect(inspect).not.toHaveBeenCalled();
    await act(async () => api.pull(api.githubAuthentication!));
    expect(prepare).toHaveBeenLastCalledWith({ repositoryId: "repo", strategy: "rebase" });
    expect(api.githubAuthentication).toBeNull();
    expect(execute).toHaveBeenCalledOnce();
  },
);

it("does not apply a pull after the selected repository changes during fetch", async () => {
  prepare.mockImplementationOnce(async () => {
    useAppStore.setState({ selectedRepositoryId: "other" });
    return ok(prepared);
  });
  await act(async () => api.pull());
  expect(execute).not.toHaveBeenCalled();
});

it("does not offer HTTPS credentials for SSH authentication failures", async () => {
  prepare.mockResolvedValue(
    err(errorFixture({ kind: "auth-failed", operation: "fetch", message: "Unlock your SSH key" })),
  );
  inspect.mockResolvedValue(
    ok({
      branches: [{ isHead: true, upstream: "origin/main" }],
      remotes: [{ name: "origin", fetchUrls: ["git@example.com:repo"] }],
    }),
  );
  await act(async () => api.pull());
  expect(api.authentication).toBeNull();
  expect(api.error).toBe("Unlock your SSH key");
});

it("shows the shared spinner and check inside Pull without opening a progress dialog", async () => {
  let finish!: (value: ReturnType<typeof ok>) => void;
  prepare.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => root.render(<RepositorySyncActions />));
  const pullButton = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Pull",
  )!;
  await act(async () => pullButton.click());
  expect(pullButton.getAttribute("aria-busy")).toBe("true");
  expect(pullButton.querySelector(".ui-action-visible .lucide-loader-circle")).not.toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => {
    finish(ok(prepared));
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  expect(pullButton.querySelector(".ui-action-visible .lucide-check")).not.toBeNull();
  expect(container.querySelector('[role="status"]')?.className).toBe("sr-only");
});

it("shows an inline X on failure and only opens error details when requested", async () => {
  prepare.mockResolvedValueOnce(
    err(
      errorFixture({ kind: "network-failed", operation: "fetch", message: "Network unavailable" }),
    ),
  );
  await act(async () => root.render(<RepositorySyncActions />));
  const pullButton = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Pull",
  )!;
  await act(async () => {
    pullButton.click();
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  expect(pullButton.querySelector(".ui-action-visible .lucide-x")).not.toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => pullButton.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Network unavailable");
});

it("allows cancelling the GitHub settings prompt without navigating or retrying the pull", async () => {
  useShellStore.setState({ request: null });
  prepare.mockResolvedValueOnce(
    err(
      errorFixture({
        kind: "github-auth-required",
        operation: "fetch",
        message: "Sign in with GitHub",
      }),
    ),
  );
  await act(async () => root.render(<RepositorySyncActions />));
  const button = (label: string) =>
    [...document.querySelectorAll("button")].find((item) => item.textContent === label)!;
  await act(async () => {
    button("Pull").click();
    await new Promise((done) => setTimeout(done, 400));
  });
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Open Settings");
  expect(document.querySelector('[aria-label="GitHub connection"]')).toBeNull();
  expect(useShellStore.getState().request).toBeNull();
  await act(async () => button("Cancel").click());
  expect(useShellStore.getState().request).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(prepare).toHaveBeenCalledOnce();
  expect(execute).not.toHaveBeenCalled();
});

it("does not start work for an inactive repository or without an active profile", async () => {
  useAppStore.setState({ selectedRepositoryId: "another-repo" });
  await act(async () => api.pull("rebase"));
  expect(prepare).not.toHaveBeenCalled();
  useAppStore.setState({ selectedRepositoryId: "repo", activeIdentity: null });
  await act(async () => api.pull("rebase"));
  expect(prepare).not.toHaveBeenCalled();
  expect(preference).not.toHaveBeenCalled();
  expect(api.busy).toBe(false);
});
