import { errorFixture } from "../../helpers/error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { GitError, type Result } from "@shared/errors";
import { IPC_CHANNELS, IPC_EVENTS, type IpcChannel } from "@shared/ipc";
import type { Identity } from "@shared/identity/identity";
import type { Services } from "@main/services";
import { registerIpcHandlers } from "@main/ipc/register";
import { beginUpdateInstall } from "@main/ipc/transport";

it("blocks new work during update installation while allowing the draft-save handshake", async () => {
  const mocks = setup();
  const release = beginUpdateInstall();
  try {
    expect(await invoke(IPC_CHANNELS.operationsList)).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("restarting") },
    });
    expect(
      await invoke(
        IPC_CHANNELS.sessionsChange,
        { profileId: profile.id, windowId: "fixture", generation: 1 },
        { kind: "view", view: "changes", repositoryId },
      ),
    ).toMatchObject({ ok: true });
    expect(mocks.sessions.change).toHaveBeenCalledOnce();
  } finally {
    release();
  }
  expect(await invoke(IPC_CHANNELS.operationsList)).toMatchObject({ ok: true });
});

it("refuses updater commands from a subframe without entering the native service", async () => {
  const mocks = setup();
  const handler = handlers.get(IPC_CHANNELS.updatesInstall)!;
  const response = await handler({ ...event, senderFrame: {} } as Electron.IpcMainInvokeEvent);
  expect(response).toMatchObject({ ok: false, error: { kind: "invalid-input" } });
  expect(mocks.updates.install).not.toHaveBeenCalled();
});

const electron = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn(),
  send: vi.fn(),
  destroy: vi.fn(),
  setZoomFactor: vi.fn(),
  minimize: vi.fn(),
  maximize: vi.fn(),
  unmaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn(() => false),
  fromWebContents: vi.fn(),
  showMessageBox: vi.fn(),
  forcefullyCrashRenderer: vi.fn(),
  openDevTools: vi.fn(),
  openExternal: vi.fn(),
  writeText: vi.fn(),
  reload: vi.fn(),
  clearStorageData: vi.fn(async () => {}),
  clearCache: vi.fn(async () => {}),
  setOpacity: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { on: electron.on },
  ipcMain: { handle: electron.handle },
  BrowserWindow: {
    getAllWindows: () => [
      {
        webContents: {
          send: electron.send,
          setZoomFactor: electron.setZoomFactor,
          getZoomFactor: () => 1,
          isDestroyed: () => false,
        },
      },
    ],
    fromWebContents: electron.fromWebContents,
  },
  dialog: { showMessageBox: electron.showMessageBox },
  shell: { openExternal: electron.openExternal },
  clipboard: { writeText: electron.writeText },
}));

const profile: Identity = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  name: "Work",
  gitName: "Author",
  gitEmail: "author@example.com",
  hue: 210,
  signing: { format: "none", signCommits: false },
  rules: [],
  createdAt: "now",
  updatedAt: "now",
};

const repositoryId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const mainFrame = {};
const event = {
  sender: {
    id: 42,
    mainFrame,
    isDestroyed: () => false,
    forcefullyCrashRenderer: electron.forcefullyCrashRenderer,
    openDevTools: electron.openDevTools,
    reload: electron.reload,
    setZoomFactor: electron.setZoomFactor,
    session: { clearStorageData: electron.clearStorageData, clearCache: electron.clearCache },
  },
  senderFrame: mainFrame,
} as unknown as Electron.IpcMainInvokeEvent;

type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<Result<unknown>>;

let handlers: Map<IpcChannel, Handler>;

function setup() {
  const mocks = {
    updates: {
      onChange: vi.fn(),
      refreshSchedule: vi.fn(),
      snapshot: vi.fn(),
      check: vi.fn(),
      download: vi.fn(),
      cancel: vi.fn(),
      install: vi.fn(),
    },
    resetData: vi.fn(async () => {}),
    github: {
      repositoryAccess: vi.fn(async () => ({ accountId: "7", accounts: ["work-user"] })),
      status: vi.fn(() => ({ configured: true, secureStorage: true, account: null })),
      profile: vi.fn(async () => ({
        id: "7",
        login: "work-user",
        name: "Work User",
        bio: null,
        location: null,
      })),
      profileUrl: vi.fn(() => "https://github.com/work-user"),
      begin: vi.fn(),
      poll: vi.fn(),
      cancel: vi.fn(),
      disconnect: vi.fn(),
      verifyPending: vi.fn(() => "ABCD-EFGH"),
      onInstallationChanged: vi.fn(() => () => {}),
      startInstallation: vi.fn(() => "https://github.com/apps/eda-fixture/installations/new"),
    },
    avatars: { getGitHub: vi.fn(async () => ({ dataUrl: "data:image/png;base64,AQID" })) },
    navigation: { onChange: vi.fn(), take: vi.fn(() => []) },
    operations: { onChange: vi.fn(), list: vi.fn(() => []), cancel: vi.fn(), retry: vi.fn() },
    identity: {
      onChange: vi.fn(),
      reapplyGlobal: vi.fn(),
      getActive: vi.fn(() => profile),
      serialize: vi.fn(async (work: () => Promise<unknown>) => work()),
    },
    identities: { findById: vi.fn(() => profile) },
    sessions: { change: vi.fn(), open: vi.fn(), hasBinding: vi.fn(() => true), close: vi.fn() },
    writer: { stage: vi.fn(), clearLocalCommitConfig: vi.fn() },
    credentials: { unlockActiveKey: vi.fn() },
    sshHostTrust: { current: vi.fn(() => null), respond: vi.fn(() => true) },
    preferences: { set: vi.fn(), reset: vi.fn(), resolve: vi.fn(() => ({ value: 125 })) },
  };

  registerIpcHandlers(mocks as unknown as Services);

  return mocks;
}

function invoke(channel: IpcChannel, ...args: unknown[]) {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`Missing handler: ${channel}`);
  return handler(event, ...args);
}

beforeEach(() => {
  vi.clearAllMocks();
  electron.fromWebContents.mockReturnValue({
    destroy: electron.destroy,
    isDestroyed: () => false,
    isMaximized: electron.isMaximized,
    minimize: electron.minimize,
    maximize: electron.maximize,
    unmaximize: electron.unmaximize,
    close: electron.close,
    setOpacity: electron.setOpacity,
  });
  handlers = new Map();
  electron.handle.mockImplementation((channel: IpcChannel, handler: Handler) => {
    if (handlers.has(channel)) throw new Error(`Duplicate handler: ${channel}`);
    handlers.set(channel, handler);
  });
});

afterEach(() => vi.restoreAllMocks());

describe("IPC registration", () => {
  it("copies text through the native clipboard and rejects invalid requests", async () => {
    setup();
    expect(await invoke(IPC_CHANNELS.appCopyText, "ABCD-EFGH")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(electron.writeText).toHaveBeenCalledExactlyOnceWith("ABCD-EFGH");
    for (const value of [null, 42, "bad\0value", "x".repeat(1_048_577)])
      expect(await invoke(IPC_CHANNELS.appCopyText, value)).toMatchObject({ ok: false });
    expect(electron.writeText).toHaveBeenCalledOnce();
  });
  it("loads the connected GitHub profile and cached avatar for the active owner, and opens its verified profile link", async () => {
    const { github, avatars } = setup();
    expect(await invoke(IPC_CHANNELS.githubRepositoryAccess, repositoryId)).toMatchObject({
      ok: false,
    });
    expect(github.repositoryAccess).not.toHaveBeenCalled();
    expect(await invoke(IPC_CHANNELS.githubRepositoryAccess, profile.id)).toMatchObject({
      ok: true,
      value: { accountId: "7", accounts: ["work-user"] },
    });
    expect(github.repositoryAccess).toHaveBeenCalledExactlyOnceWith(profile.id);
    expect(await invoke(IPC_CHANNELS.githubProfile, repositoryId)).toMatchObject({ ok: false });
    expect(github.profile).not.toHaveBeenCalled();
    expect(await invoke(IPC_CHANNELS.githubProfile, profile.id)).toMatchObject({
      ok: true,
      value: { id: "7", login: "work-user", avatarDataUrl: "data:image/png;base64,AQID" },
    });
    expect(github.profile).toHaveBeenCalledWith(profile.id);
    expect(avatars.getGitHub).toHaveBeenCalledExactlyOnceWith("7");
    await invoke(IPC_CHANNELS.githubOpenProfile, profile.id);
    expect(github.profileUrl).toHaveBeenCalledWith(profile.id);
    expect(electron.openExternal).toHaveBeenCalledExactlyOnceWith("https://github.com/work-user");
  });
  it("captures GitHub profile ownership, rejects stale profiles and opens only the fixed verification page", async () => {
    const { github } = setup();
    expect(await invoke(IPC_CHANNELS.githubBegin, repositoryId)).toMatchObject({ ok: false });
    expect(github.begin).not.toHaveBeenCalled();
    await invoke(IPC_CHANNELS.githubBegin, profile.id);
    expect(github.begin).toHaveBeenCalledWith(profile.id);
    expect(await invoke(IPC_CHANNELS.githubPoll, profile.id, "invalid")).toMatchObject({
      ok: false,
    });
    expect(github.poll).not.toHaveBeenCalled();
    await invoke(IPC_CHANNELS.githubPoll, profile.id, repositoryId);
    expect(github.poll).toHaveBeenCalledWith(profile.id, repositoryId);
    await invoke(IPC_CHANNELS.githubOpenVerification, profile.id, repositoryId);
    expect(github.verifyPending).toHaveBeenCalledWith(profile.id, repositoryId);
    expect(electron.writeText).toHaveBeenCalledExactlyOnceWith("ABCD-EFGH");
    expect(electron.writeText.mock.invocationCallOrder[0]).toBeLessThan(
      electron.openExternal.mock.invocationCallOrder[0]!,
    );
    expect(electron.openExternal).toHaveBeenCalledExactlyOnceWith(
      "https://github.com/login/device",
    );
    github.verifyPending.mockImplementationOnce(() => {
      throw new GitError(
        errorFixture({ kind: "invalid-input", operation: "sign-in", message: "expired" }),
      );
    });
    expect(
      await invoke(IPC_CHANNELS.githubOpenVerification, profile.id, repositoryId),
    ).toMatchObject({ ok: false });
    expect(electron.openExternal).toHaveBeenCalledOnce();
    expect(electron.writeText).toHaveBeenCalledOnce();
  });
  it("accepts SSH trust decisions only from the main frame with a valid request and boolean", async () => {
    const { sshHostTrust } = setup();
    expect(await invoke(IPC_CHANNELS.sshPendingHostTrust)).toEqual({ ok: true, value: null });
    expect(sshHostTrust.current).toHaveBeenCalledWith(event.sender.id);
    const handler = handlers.get(IPC_CHANNELS.sshRespondHostTrust)!;
    expect(
      await handler(
        { ...event, senderFrame: {} } as Electron.IpcMainInvokeEvent,
        repositoryId,
        true,
      ),
    ).toMatchObject({ ok: false });
    expect(await invoke(IPC_CHANNELS.sshRespondHostTrust, repositoryId, "yes")).toMatchObject({
      ok: false,
    });
    expect(await invoke(IPC_CHANNELS.sshRespondHostTrust, "invalid", true)).toMatchObject({
      ok: false,
    });
    expect(sshHostTrust.respond).not.toHaveBeenCalled();
    expect(await invoke(IPC_CHANNELS.sshRespondHostTrust, repositoryId, true)).toMatchObject({
      ok: true,
    });
    expect(sshHostTrust.respond).toHaveBeenCalledWith(event.sender.id, repositoryId, true);
    sshHostTrust.respond.mockReturnValue(false);
    expect(await invoke(IPC_CHANNELS.sshRespondHostTrust, repositoryId, true)).toMatchObject({
      ok: false,
    });
  });

  it("validates explicit global apply and forwards the captured profile to the coordinator", async () => {
    const { identity } = setup();
    expect(await invoke(IPC_CHANNELS.identityReapplyGlobal, "invalid")).toMatchObject({
      ok: false,
    });
    expect(identity.reapplyGlobal).not.toHaveBeenCalled();
    expect(await invoke(IPC_CHANNELS.identityReapplyGlobal, profile.id)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(identity.reapplyGlobal).toHaveBeenCalledWith(profile.id);
  });
  it("resets only after confirmation, clears browser data, and reloads the existing renderer", async () => {
    const mocks = setup();
    electron.showMessageBox.mockResolvedValueOnce({ response: 0 });
    await invoke(IPC_CHANNELS.appDebug, "reset-data");
    expect(mocks.resetData).not.toHaveBeenCalled();
    expect(electron.reload).not.toHaveBeenCalled();

    electron.showMessageBox.mockResolvedValueOnce({ response: 1 });
    expect(await invoke(IPC_CHANNELS.appDebug, "reset-data")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(mocks.resetData).toHaveBeenCalledOnce();
    expect(electron.clearStorageData).toHaveBeenCalledOnce();
    expect(electron.clearCache).toHaveBeenCalledOnce();
    expect(electron.reload).toHaveBeenCalledOnce();
    expect(electron.destroy).not.toHaveBeenCalled();
  });

  it("blocks stale requests during reset and releases the bridge after a failed reset", async () => {
    const mocks = setup();
    let fail!: (error: Error) => void;
    mocks.resetData.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    electron.showMessageBox.mockResolvedValueOnce({ response: 1 });
    const reset = invoke(IPC_CHANNELS.appDebug, "reset-data");
    await vi.waitFor(() => expect(mocks.resetData).toHaveBeenCalledOnce());
    expect(await invoke(IPC_CHANNELS.appCopyText, "stale")).toMatchObject({ ok: false });
    expect(electron.writeText).not.toHaveBeenCalled();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fail(new Error("reset failed"));
    expect(await reset).toMatchObject({ ok: false });
    expect(electron.reload).not.toHaveBeenCalled();
    expect(await invoke(IPC_CHANNELS.appCopyText, "fresh")).toMatchObject({ ok: true });
    log.mockRestore();
  });

  it("restricts debug actions to the caller window and requires confirmation before a renderer crash", async () => {
    setup();
    expect(await invoke(IPC_CHANNELS.appDebug, "main-process-crash")).toMatchObject({ ok: false });
    expect(electron.fromWebContents).not.toHaveBeenCalled();

    const handler = handlers.get(IPC_CHANNELS.appDebug)!;

    expect(
      await handler({ ...event, senderFrame: {} } as Electron.IpcMainInvokeEvent, "renderer-crash"),
    ).toMatchObject({ ok: false });
    expect(electron.showMessageBox).not.toHaveBeenCalled();

    electron.showMessageBox.mockResolvedValueOnce({ response: 0 });
    await invoke(IPC_CHANNELS.appDebug, "renderer-crash");
    expect(electron.forcefullyCrashRenderer).not.toHaveBeenCalled();

    electron.showMessageBox.mockResolvedValueOnce({ response: 1 });
    await invoke(IPC_CHANNELS.appDebug, "renderer-crash");
    expect(electron.forcefullyCrashRenderer).toHaveBeenCalledOnce();
    expect(electron.fromWebContents).toHaveBeenCalledWith(event.sender);

    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await invoke(IPC_CHANNELS.appDebug, "ipc-error")).toMatchObject({
      ok: false,
      error: {
        kind: "unknown",
        code: "DEBUG_IPC_FAILURE",
        message: "Eda debug simulation: unexpected IPC error.",
      },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("debug simulation");
  });

  it("limits window controls to the caller and uses the normal close/save lifecycle", async () => {
    setup();
    expect(await invoke(IPC_CHANNELS.appWindowControl, "destroy")).toMatchObject({ ok: false });
    expect(electron.fromWebContents).not.toHaveBeenCalled();

    await invoke(IPC_CHANNELS.appWindowControl, "minimize");
    expect(electron.fromWebContents).toHaveBeenCalledWith(event.sender);
    expect(electron.minimize).toHaveBeenCalledOnce();

    await invoke(IPC_CHANNELS.appWindowControl, "toggle-maximize");
    expect(electron.maximize).toHaveBeenCalledOnce();

    electron.isMaximized.mockReturnValueOnce(true);
    await invoke(IPC_CHANNELS.appWindowControl, "toggle-maximize");
    expect(electron.unmaximize).toHaveBeenCalledOnce();

    await invoke(IPC_CHANNELS.appWindowControl, "close");
    expect(electron.close).toHaveBeenCalledOnce();
    expect(electron.destroy).not.toHaveBeenCalled();

    electron.fromWebContents.mockReturnValueOnce(null);
    expect(await invoke(IPC_CHANNELS.appWindowControl, "state")).toMatchObject({ ok: false });
  });

  it("registers every public request channel exactly once", () => {
    setup();
    expect([...handlers.keys()].sort()).toEqual(Object.values(IPC_CHANNELS).sort());
  });

  it("validates mutation requests before calling services or broadcasting changes", async () => {
    const { writer } = setup();

    expect(
      await invoke(IPC_CHANNELS.identityCreate, profile, { syncGlobalGitConfig: "false" }),
    ).toMatchObject({ ok: false, error: { kind: "invalid-input" } });
    expect(await invoke(IPC_CHANNELS.repositoryStage, { repositoryId: "invalid" })).toMatchObject({
      ok: false,
      error: { kind: "invalid-input" },
    });
    expect(writer.stage).not.toHaveBeenCalled();

    for (const [id, group] of [
      [repositoryId, "remote.origin.url"],
      ["invalid", "all"],
    ])
      expect(await invoke(IPC_CHANNELS.repositoryClearLocalCommitConfig, id, group)).toMatchObject({
        ok: false,
        error: { kind: "invalid-input" },
      });

    expect(writer.clearLocalCommitConfig).not.toHaveBeenCalled();
    expect(electron.send).not.toHaveBeenCalled();

    expect(
      await invoke(IPC_CHANNELS.repositoryStage, { repositoryId, paths: ["readme.md"] }),
    ).toEqual({ ok: true, value: undefined });
    expect(writer.stage).toHaveBeenCalledWith(repositoryId, ["readme.md"]);
    expect(electron.send).toHaveBeenCalledExactlyOnceWith(
      IPC_EVENTS.repositoryChanged,
      repositoryId,
    );
    expect(
      await invoke(IPC_CHANNELS.repositoryClearLocalCommitConfig, repositoryId, "author"),
    ).toEqual({ ok: true, value: undefined });
    expect(writer.clearLocalCommitConfig).toHaveBeenCalledWith(repositoryId, "author");
  });

  it("preserves domain errors without emitting successful invalidations", async () => {
    const { writer } = setup();
    const failure = new GitError(
      errorFixture({
        kind: "lock-contention",
        operation: "stage",
        message: "Index is locked.",
      }),
    );

    writer.stage.mockRejectedValueOnce(failure);
    expect(await invoke(IPC_CHANNELS.repositoryStage, { repositoryId })).toEqual({
      ok: false,
      error: failure.toData(),
    });
    expect(electron.send).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected errors at the transport boundary", async () => {
    const { writer } = setup();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    writer.stage.mockRejectedValueOnce(new Error("internal implementation detail"));

    const result = await invoke(IPC_CHANNELS.repositoryStage, { repositoryId });

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "unknown", operation: IPC_CHANNELS.repositoryStage },
    });
    expect(JSON.stringify(result)).not.toContain("internal implementation detail");
    expect(JSON.stringify(log.mock.calls)).not.toContain("internal implementation detail");
    expect(electron.send).not.toHaveBeenCalled();
  });

  it("keeps caller identity and session generation in the save request", async () => {
    const { sessions } = setup();
    const context = { profileId: profile.id, windowId: "primary", generation: 7 };
    const change = { kind: "tabs", tabs: [], selectedRepositoryId: null };

    expect(await invoke(IPC_CHANNELS.sessionsChange, context, change)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(sessions.change).toHaveBeenCalledWith(42, context, change);
    expect(
      await invoke(IPC_CHANNELS.sessionsChange, { ...context, generation: undefined }, change),
    ).toMatchObject({ ok: false, error: { kind: "invalid-input" } });
    expect(sessions.change).toHaveBeenCalledTimes(1);
  });

  it("captures the profile before queued credential work and rejects a mismatched profile", async () => {
    const { identity, credentials } = setup();

    expect(
      await invoke(IPC_CHANNELS.credentialsUnlockActiveKey, {}, "secret", repositoryId),
    ).toMatchObject({ ok: false, error: { kind: "invalid-input" } });
    expect(identity.serialize).not.toHaveBeenCalled();

    identity.serialize.mockImplementationOnce(async (work) => {
      identity.getActive.mockReturnValue({ ...profile, id: repositoryId });
      return work();
    });
    await invoke(IPC_CHANNELS.credentialsUnlockActiveKey, { remember: true }, "secret", profile.id);
    expect(credentials.unlockActiveKey).toHaveBeenCalledWith({ remember: true }, "secret", profile);
  });

  it("validates setting ownership and updates every window after saving global zoom", async () => {
    const { preferences } = setup();

    expect(
      await invoke(
        IPC_CHANNELS.settingsSet,
        "theme",
        { kind: "profile", profileId: repositoryId },
        "nord",
      ),
    ).toMatchObject({ ok: false, error: { kind: "invalid-input" } });
    expect(preferences.set).not.toHaveBeenCalled();

    await invoke(IPC_CHANNELS.settingsSet, "uiZoom", { kind: "application" }, 125);
    expect(preferences.set).toHaveBeenCalledWith("uiZoom", { kind: "application" }, 125);
    expect(electron.setZoomFactor).toHaveBeenCalledWith(1.25);
    expect(electron.send).toHaveBeenCalledWith(IPC_EVENTS.settingChanged, {
      key: "uiZoom",
      scope: { kind: "application" },
    });
  });

  it("requires the window close nonce before draining writes and destroying the window", async () => {
    const { sessions, identity } = setup();
    const window = Object.assign(new EventEmitter(), {
      webContents: {
        id: 42,
        isDestroyed: () => false,
        isCrashed: () => false,
        send: electron.send,
      },
    });

    const onWindowCreated = electron.on.mock.calls.find(
      ([name]) => name === "browser-window-created",
    )?.[1] as (event: unknown, window: unknown) => void;

    onWindowCreated({}, window);

    const preventDefault = vi.fn();

    window.emit("close", { preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();

    const nonce = electron.send.mock.calls[0]?.[1] as string;

    expect(await invoke(IPC_CHANNELS.sessionsReadyToClose, "wrong")).toMatchObject({
      ok: false,
      error: { kind: "invalid-input" },
    });
    expect(electron.destroy).not.toHaveBeenCalled();
    expect(await invoke(IPC_CHANNELS.sessionsReadyToClose, nonce)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(identity.serialize).toHaveBeenCalledOnce();
    expect(electron.destroy).toHaveBeenCalledOnce();

    window.emit("closed");
    expect(sessions.close).toHaveBeenCalledWith(42);
  });
});
