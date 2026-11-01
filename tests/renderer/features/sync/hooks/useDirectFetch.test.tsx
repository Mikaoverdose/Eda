import { errorFixture } from "../../../../helpers/error";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ok, err } from "@shared/errors";
import { useDirectFetch } from "@renderer/features/sync/hooks/useDirectFetch";
import { RepositorySyncActions } from "@renderer/features/sync/RepositorySyncActions";
import { useAppStore } from "@renderer/stores/app-store";
import { useRepositoryStore } from "@renderer/stores/repository-store";
import { useShellStore } from "@renderer/stores/shell-store";

let root: Root;
let container: HTMLDivElement;
let api: ReturnType<typeof useDirectFetch>;
const inspect = vi.fn();
const fetchRemote = vi.fn();
const resolve = vi.fn();
function Harness() {
  api = useDirectFetch("repo");
  return null;
}
beforeEach(async () => {
  useShellStore.setState({ request: null });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useAppStore.setState({
    selectedRepositoryId: "repo",
    activeIdentity: { id: "profile" } as never,
  });
  useRepositoryStore.setState({
    repositoryId: "repo",
    identityId: "profile",
    phase: "ready",
    writing: false,
  });
  vi.spyOn(useRepositoryStore.getState(), "syncFromDisk").mockResolvedValue();
  inspect.mockReset().mockResolvedValue(
    ok({
      branches: [{ isHead: true, upstream: "team/main" }],
      remotes: [
        { name: "origin", fetchUrls: ["https://example.com/origin"] },
        { name: "team", fetchUrls: ["https://example.com/team"] },
      ],
    }),
  );
  fetchRemote.mockReset().mockResolvedValue(ok("Fetched."));
  resolve
    .mockReset()
    .mockImplementation(async (key: string) => ok({ value: key === "fetchPrune" }));
  vi.stubGlobal("eda", { remotes: { inspect, fetch: fetchRemote }, settings: { resolve } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useShellStore.setState({ request: null });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("fetches the upstream remote directly with repository defaults", async () => {
  await act(async () => api.fetch());
  expect(fetchRemote).toHaveBeenCalledExactlyOnceWith({
    repositoryId: "repo",
    remote: "team",
    prune: true,
    tags: false,
  });
  expect(resolve).toHaveBeenCalledWith("fetchPrune", {
    profileId: "profile",
    repositoryId: "repo",
  });
  expect(api.message).toBe("Fetched team.");
});
it("fetches all remotes sequentially", async () => {
  await act(async () => api.fetch(null));
  expect(fetchRemote.mock.calls.map(([request]) => request.remote)).toEqual(["origin", "team"]);
  expect(api.message).toBe("Fetched all remotes.");
});
it("requests credentials only after an HTTPS auth failure and pins the retry", async () => {
  fetchRemote.mockResolvedValueOnce(
    err(
      errorFixture({ kind: "auth-failed", operation: "fetch", message: "Authentication failed." }),
    ),
  );
  await act(async () => api.fetch());
  expect(api.authentication).toBe("team");
  const credentials = { username: "user", password: "token" };
  await act(async () => api.fetch(api.authentication!, credentials));
  expect(fetchRemote).toHaveBeenLastCalledWith({
    repositoryId: "repo",
    remote: "team",
    prune: true,
    tags: false,
    credentials,
  });
  expect(api.authentication).toBeNull();
});
it("does not start a transfer after switching repository while resolving defaults", async () => {
  resolve.mockImplementation(async () => {
    useAppStore.setState({ selectedRepositoryId: "other" });
    return ok({ value: false });
  });
  await act(async () => api.fetch());
  expect(fetchRemote).not.toHaveBeenCalled();
});
it("prevents duplicate transfers", async () => {
  await act(async () => {
    await Promise.all([api.fetch(), api.fetch()]);
  });
  expect(fetchRemote).toHaveBeenCalledOnce();
});
it("stops Fetch all on failure without fetching later remotes", async () => {
  fetchRemote.mockResolvedValueOnce(
    err(errorFixture({ kind: "unknown", operation: "fetch", message: "Network unavailable." })),
  );
  await act(async () => api.fetch(null));
  expect(fetchRemote).toHaveBeenCalledOnce();
  expect(api.error).toBe("Network unavailable.");
});
it("clicking the toolbar Fetch starts a transfer without opening a modal", async () => {
  await act(async () => root.render(<RepositorySyncActions />));
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === "Fetch",
  )!;
  await act(async () => {
    button.click();
    await new Promise((done) => setTimeout(done, 400));
  });
  expect(fetchRemote).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it.each(["github-auth-required", "github-access-required"] as const)(
  "routes %s to Integrations only when Open Settings is clicked",
  async (kind) => {
    fetchRemote.mockResolvedValueOnce(
      err({ kind, operation: "fetch", message: "GitHub connection needs attention" }),
    );
    await act(async () => root.render(<RepositorySyncActions />));
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find((item) => item.textContent === label)!;
    await act(async () => {
      button("Fetch").click();
      await new Promise((done) => setTimeout(done, 400));
    });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Open Settings");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      kind === "github-access-required" ? "Enable GitHub repository access" : "Sign in with GitHub",
    );
    expect(document.querySelector('[aria-label="GitHub connection"]')).toBeNull();
    expect(useShellStore.getState().request).toBeNull();
    await act(async () => button("Open Settings").click());
    expect(useShellStore.getState().request).toEqual({ kind: "settings", section: "integrations" });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(fetchRemote).toHaveBeenCalledOnce();
  },
);
