import { errorFixture } from "../../helpers/error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@shared/errors";
import {
  emptySession,
  emptyView,
  type SessionSnapshot,
  type SessionContext,
  type SessionChange,
} from "@shared/identity/profile-session";
import { useSessionStore } from "@renderer/stores/session-store";

const snapshot = (profileId = "work"): SessionSnapshot => ({
  context: { profileId, windowId: "primary", generation: 1 },
  session: emptySession(),
  drafts: {},
  recovery: null,
});

const save = vi.fn<(context: SessionContext, change: SessionChange) => Promise<Result<void>>>(
  async () => ok(undefined),
);

beforeEach(() => {
  save.mockReset().mockResolvedValue(ok(undefined));
  Object.defineProperty(window, "eda", {
    configurable: true,
    value: { sessions: { change: save, open: async () => ok(snapshot("home")) } },
  });
  useSessionStore.setState({
    snapshot: snapshot(),
    error: null,
    saving: false,
    transitioning: false,
    draftRevisions: {},
  });
});

afterEach(async () => {
  save.mockResolvedValue(ok(undefined));
  await useSessionStore.getState().flush();
});

describe("session save acknowledgements", () => {
  it("ignores late view updates after a switch starts, preserving the prepared session", () => {
    useSessionStore.setState({ transitioning: true });
    useSessionStore
      .getState()
      .change({ kind: "tabs", tabs: ["old-repo"], selectedRepositoryId: "old-repo" });
    expect(save).not.toHaveBeenCalled();
    expect(useSessionStore.getState().snapshot?.session.tabs).toEqual([]);
  });

  it("shares layout across existing and new repositories without sharing selections or profiles", async () => {
    const initial = snapshot();

    initial.session.selectedRepositoryId = "a";
    initial.session.views = {
      a: { ...emptyView(), selection: { kind: "commit", oid: "first" } },
      b: { ...emptyView(), selection: { kind: "commit", oid: "second" } },
    };
    useSessionStore.setState({ snapshot: initial });

    const store = useSessionStore.getState();

    store.setView("a", {
      collapsed: { graph: false, diff: true, rail: false },
      splits: { rail: 0.6 },
      references: { hidden: true, locals: false, remotes: true, tags: true },
    });
    store.change({ kind: "tabs", tabs: ["a", "b", "c"], selectedRepositoryId: "c" });
    expect(await store.flush()).toBe(true);

    const views = useSessionStore.getState().snapshot!.session.views;

    expect(views["b"]?.selection).toEqual({ kind: "commit", oid: "second" });
    expect(views["a"]?.selection).toEqual({ kind: "commit", oid: "first" });

    for (const id of ["b", "c"]) {
      expect(views[id]?.collapsed.diff).toBe(true);
      expect(views[id]?.splits).toEqual({ rail: 0.6 });
      expect(views[id]?.references?.hidden).toBe(true);
    }

    expect(
      save.mock.calls
        .filter(([, change]) => change.kind === "view" && change.repositoryId === "c")
        .at(-1)?.[1],
    ).toMatchObject({ view: { collapsed: { diff: true } } });
    expect(await store.load()).toBe(true);
    expect(useSessionStore.getState().snapshot?.session.views).toEqual({});
  });

  it("captures the original profile when draft writes wait in a queue", async () => {
    let release!: () => void;

    save.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return ok(undefined);
    });

    const store = useSessionStore.getState();

    store.setDraft("repo", { version: 1, message: "first", amend: false });
    store.setDraft("repo", { version: 1, message: "second", amend: true });
    expect(save).toHaveBeenCalledTimes(1);

    release();
    expect(await store.flush()).toBe(true);
    expect(save.mock.calls.map((call) => call[0].profileId)).toEqual(["work", "work"]);
    expect(useSessionStore.getState().snapshot?.drafts["repo"]).toEqual({
      version: 1,
      message: "second",
      amend: true,
    });
  });

  it("keeps input and the old context after a failed save; retry acknowledges it", async () => {
    save.mockResolvedValueOnce(
      err(errorFixture({ kind: "unknown", operation: "save", message: "Disk full" })),
    );

    const store = useSessionStore.getState();

    store.setDraft("repo", { version: 1, message: "keep my text", amend: false });
    expect(await store.flush()).toBe(false);
    expect(useSessionStore.getState().snapshot?.drafts["repo"]?.message).toBe("keep my text");
    expect(useSessionStore.getState().error).toBe("Disk full");
    expect(await store.flush()).toBe(true);
    expect(useSessionStore.getState().error).toBeNull();
  });

  it("does not load the next profile when the previous session cannot save", async () => {
    save.mockResolvedValue(
      err(errorFixture({ kind: "unknown", operation: "save", message: "read-only" })),
    );
    useSessionStore
      .getState()
      .setDraft("repo", { version: 1, message: "unacknowledged", amend: false });
    expect(await useSessionStore.getState().load()).toBe(false);
    expect(useSessionStore.getState().snapshot?.context.profileId).toBe("work");
  });

  it("restores a different profile only after all pending draft writes finish", async () => {
    useSessionStore
      .getState()
      .setDraft("repo", { version: 1, message: "saved before switching", amend: false });
    expect(await useSessionStore.getState().load()).toBe(true);
    expect(useSessionStore.getState().snapshot?.context.profileId).toBe("home");
    expect(useSessionStore.getState().snapshot?.drafts).toEqual({});
  });

  it("preserves unsupported state until recovery instead of autosaving over it", async () => {
    useSessionStore.setState({ snapshot: { ...snapshot(), recovery: "Newer version" } });
    useSessionStore
      .getState()
      .setDraft("repo", { version: 1, message: "must not overwrite", amend: false });
    expect(save).not.toHaveBeenCalled();
    expect(useSessionStore.getState().snapshot?.drafts).toEqual({});
  });
});

it("keeps a newer switched session when an earlier session load finishes", async () => {
  let finish!: (result: Result<SessionSnapshot | null>) => void;
  window.eda.sessions.open = vi.fn(
    () =>
      new Promise<Result<SessionSnapshot | null>>((resolve) => {
        finish = resolve;
      }),
  );
  const loading = useSessionStore.getState().load();
  await vi.waitFor(() => expect(window.eda.sessions.open).toHaveBeenCalled());
  useSessionStore.setState({
    snapshot: {
      ...snapshot("new"),
      context: { profileId: "new", windowId: "primary", generation: 2 },
    },
  });
  finish(ok(snapshot("old")));
  expect(await loading).toBe(false);
  expect(useSessionStore.getState().snapshot?.context.profileId).toBe("new");
});
