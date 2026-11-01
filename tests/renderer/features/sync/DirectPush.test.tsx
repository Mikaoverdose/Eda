import { errorFixture } from "../../../helpers/error";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ok, err, type Result } from "@shared/errors";
import { DirectPush } from "@renderer/features/sync/DirectPush";
import { useAppStore } from "@renderer/stores/app-store";
import { useRepositoryStore } from "@renderer/stores/repository-store";
import { ACTION_FEEDBACK } from "@renderer/motion";

let root: Root;
let container: HTMLDivElement;
const preparePush = vi.fn();
const push = vi.fn();
const inspected = {
  branches: [{ name: "main", isHead: true, upstream: "origin/main" }],
  remotes: [{ name: "origin", pushUrls: ["https://example.com/repo"] }],
};
const preview = { token: "preview", source: "refs/heads/main", destination: "refs/heads/main" };
const button = () =>
  [...container.querySelectorAll("button")].find((item) => item.textContent === "Push")!;
const finish = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ACTION_FEEDBACK.minimumPending + 50));
  });
};

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useAppStore.setState({
    selectedRepositoryId: "repo",
    activeIdentity: { id: "profile" } as never,
  });
  useRepositoryStore.setState({ writing: false });
  vi.spyOn(useRepositoryStore.getState(), "syncFromDisk").mockResolvedValue();
  preparePush.mockReset().mockResolvedValue(ok(preview));
  push.mockReset().mockResolvedValue(ok("Push completed."));
  vi.stubGlobal("eda", {
    remotes: { inspect: vi.fn().mockResolvedValue(ok(inspected)), preparePush, push },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<DirectPush repositoryId="repo" />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("shows pending then a check, resets the outcome and supports another push", async () => {
  await act(async () => button().click());
  expect(button().getAttribute("aria-busy")).toBe("true");
  expect(button().querySelector(".ui-action-visible .lucide-loader-circle")).not.toBeNull();
  await finish();
  expect(button().querySelector(".ui-action-visible .lucide-check")).not.toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Push completed.");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ACTION_FEEDBACK.outcomeHold + 50));
  });
  expect(button().querySelector(".ui-action-visible .lucide-arrow-up")).not.toBeNull();
  await act(async () => button().click());
  await finish();
  expect(push).toHaveBeenCalledTimes(2);
  expect(button().querySelector(".ui-action-visible .lucide-check")).not.toBeNull();
});

it.each(["preview", "push"])(
  "shows an inline X for %s failure and opens details on click",
  async (stage) => {
    (stage === "preview" ? preparePush : push).mockResolvedValueOnce(
      err(
        errorFixture({ kind: "network-failed", operation: "push", message: "Network unavailable" }),
      ),
    );
    await act(async () => button().click());
    await finish();
    expect(button().querySelector(".ui-action-visible .lucide-x")).not.toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => button().click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Network unavailable");
    expect(preparePush).toHaveBeenCalledOnce();
  },
);

it("pushes to the most specific upstream remote when configured names overlap", async () => {
  vi.mocked(window.eda.remotes.inspect).mockResolvedValueOnce(
    ok({
      branches: [
        {
          name: "main",
          isHead: true,
          remote: false,
          oid: "a".repeat(40),
          upstreamState: "",
          upstream: "team/fork/release",
        },
      ],
      remotes: [
        { name: "team", fetchUrls: [], pushUrls: [] },
        { name: "team/fork", fetchUrls: [], pushUrls: [] },
      ],
    }),
  );
  await act(async () => button().click());
  await finish();
  expect(preparePush).toHaveBeenCalledWith(
    expect.objectContaining({ remote: "team/fork", destination: "release" }),
  );
});

it("does not send a push after the component closes while its preview is pending", async () => {
  let resolve: (value: Result<typeof preview>) => void = () => {};
  preparePush.mockReturnValueOnce(
    new Promise<Result<typeof preview>>((done) => {
      resolve = done;
    }),
  );
  await act(async () => button().click());
  expect(preparePush).toHaveBeenCalledOnce();
  await act(async () => root.render(null));
  await act(async () => resolve(ok(preview)));
  await finish();
  expect(push).not.toHaveBeenCalled();
});
