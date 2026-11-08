import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ok } from "@shared/errors";
import { GitLabConnection } from "@renderer/features/connections/GitLabConnection";
import { IntegrationsSettings } from "@renderer/features/settings/integrations/IntegrationsSettings";

const gitlab = {
  profile: vi.fn(),
  status: vi.fn(),
  begin: vi.fn(),
  poll: vi.fn(),
  cancel: vi.fn(),
  openAuthorization: vi.fn(),
  openProfile: vi.fn(),
  disconnect: vi.fn(),
};
const empty = { secureStorage: true, account: null };
const connected = {
  secureStorage: true,
  account: { id: "7", login: "work.user", state: "connected" },
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  for (const method of Object.values(gitlab)) method.mockReset();
  gitlab.status.mockResolvedValue(ok(empty));
  gitlab.profile.mockResolvedValue(ok({ id: "7", avatarDataUrl: "data:image/png;base64,AQID" }));
  gitlab.begin.mockResolvedValue(ok({ id: "session", expiresAt: Date.now() + 600_000 }));
  gitlab.poll.mockResolvedValue(ok({ state: "pending" }));
  for (const method of [
    gitlab.cancel,
    gitlab.openAuthorization,
    gitlab.openProfile,
    gitlab.disconnect,
  ])
    method.mockResolvedValue(ok(undefined));
  vi.stubGlobal("eda", { gitlab, github: { status: vi.fn(async () => ok(empty)) } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const button = (text: string) =>
  [...container.querySelectorAll("button")].find((item) => item.textContent === text)!;

it("opens browser authorization, completes the account connection and disconnects", async () => {
  await act(async () => root.render(<GitLabConnection profileId="work" />));
  await act(async () => button("Sign in with GitLab").click());
  expect(gitlab.openAuthorization).toHaveBeenCalledWith("work", "session");
  expect(container.textContent).toContain("Authorize Eda in your browser");
  expect(container.querySelector('input[type="password"]')).toBeNull();
  gitlab.poll.mockResolvedValue(ok({ state: "connected", status: connected }));
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(container.textContent).toContain("@work.user");
  expect(container.querySelector(".profile-avatar img")?.getAttribute("src")).toBe(
    "data:image/png;base64,AQID",
  );
  expect(container.textContent).not.toContain("Authorize Eda");
  await act(async () => button("@work.user").click());
  expect(gitlab.openProfile).toHaveBeenCalledWith("work");
  await act(async () => button("Disconnect GitLab").click());
  expect(gitlab.disconnect).toHaveBeenCalledWith("work");
  expect(container.textContent).not.toContain("@work.user");
});

it("ignores a late poll response after cancellation", async () => {
  await act(async () => root.render(<GitLabConnection profileId="work" />));
  await act(async () => button("Sign in with GitLab").click());
  let finish!: (value: unknown) => void;
  gitlab.poll.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  await act(async () => button("Cancel sign-in").click());
  await act(async () => finish(ok({ state: "connected", status: connected })));
  expect(gitlab.cancel).toHaveBeenCalledWith("work", "session");
  expect(button("Sign in with GitLab")).toBeDefined();
  expect(container.textContent).not.toContain("@work.user");
});

it("keeps self-hosted GitLab disabled while exposing the real GitLab.com connection", async () => {
  await act(async () => root.render(<IntegrationsSettings profileId="work" />));
  const hosted = container.querySelector('[aria-label="GitLab connection"]')!;
  const selfHosted = container.querySelector('[aria-label="GitLab Self-Hosted connection"]')!;
  expect(hosted.textContent).toContain("Sign in with GitLab");
  expect(selfHosted.textContent).toContain("Coming soon");
  expect(selfHosted.querySelector("button")?.disabled).toBe(true);
});

it("reveals the cached profile and avatar together without flashing initials during loading", async () => {
  gitlab.status.mockResolvedValue(ok(connected));
  let finish!: (value: unknown) => void;
  gitlab.profile.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => root.render(<GitLabConnection profileId="work" />));
  expect(container.querySelector(".ui-skeleton")).not.toBeNull();
  expect(container.querySelector(".profile-avatar")).toBeNull();
  expect(container.textContent).not.toContain("@work.user");
  await act(async () => finish(ok({ id: "7", avatarDataUrl: "data:image/png;base64,AQID" })));
  expect(container.querySelector(".ui-skeleton")).toBeNull();
  expect(container.textContent).toContain("@work.user");
  expect(container.querySelector(".profile-avatar img")?.getAttribute("src")).toBe(
    "data:image/png;base64,AQID",
  );
});
