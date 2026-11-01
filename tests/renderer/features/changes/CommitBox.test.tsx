import { errorFixture } from "../../../helpers/error";
import { type CommitDraft, emptySession } from "@shared/identity/profile-session";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CommitBox } from "@renderer/features/changes/CommitBox";
import { usePreferencesStore } from "@renderer/stores/preferences-store";
import { useRepositoryStore } from "@renderer/stores/repository-store";
import { useSessionStore } from "@renderer/stores/session-store";
import { useAppStore } from "@renderer/stores/app-store";

it("applies a chosen prefix to the draft while preserving scope, breaking marker and body", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("eda", {
    repository: {
      previewCommit: vi.fn(async () => ({
        ok: false,
        error: errorFixture({ message: "Unavailable" }),
      })),
    },
  });

  const preferences = usePreferencesStore.getState();
  const repository = useRepositoryStore.getState();
  const session = useSessionStore.getState();
  const app = useAppStore.getState();
  const setDraft = vi.fn((repositoryId: string, draft: CommitDraft) => {
    const snapshot = useSessionStore.getState().snapshot!;
    useSessionStore.setState({
      snapshot: { ...snapshot, drafts: { ...snapshot.drafts, [repositoryId]: draft } },
    });
  });

  const container = document.createElement("div");

  document.body.append(container);

  const root = createRoot(container);

  try {
    useRepositoryStore.setState({ repositoryId: "repo", status: null });
    useAppStore.setState({ selectedRepositoryId: "repo" });
    useSessionStore.setState({
      transitioning: false,
      snapshot: {
        context: { profileId: "profile", windowId: "window", generation: 1 },
        session: emptySession(),
        recovery: null,
        drafts: {
          repo: { version: 1, message: "feat(core)!: change API\n\nDetails", amend: false },
        },
      },
      setDraft,
    });
    usePreferencesStore.setState({
      values: {
        ...preferences.values,
        conventionalCommitsEnabled: {
          ...preferences.values.conventionalCommitsEnabled,
          value: true,
        },
        commitPrefixes: { ...preferences.values.commitPrefixes, value: ["feat", "repair"] },
      },
    });
    await act(async () => root.render(<CommitBox />));
    expect(setDraft).not.toHaveBeenCalled();

    const title = container.querySelector<HTMLInputElement>('[aria-label="Commit title"]')!;

    expect(title.value).toBe("change API");

    const input = async (field: HTMLInputElement, value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          field,
          value,
        );
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    const picker = container.querySelector<HTMLButtonElement>('[aria-label="Commit prefix"]')!;

    await act(async () => picker.click());

    const search = document.querySelector<HTMLInputElement>(
      '[aria-label="Search commit prefixes"]',
    )!;

    await input(search, "rep");
    expect(document.querySelector('[data-eda-select-value="feat"]')).toBeNull();
    expect(document.querySelector('[data-eda-select-value=""]')?.textContent).toContain(
      "No prefix",
    );

    const option = document.querySelector<HTMLElement>('[data-eda-select-value="repair"]')!;

    expect(option).toBeTruthy();

    await act(async () => option.click());
    expect(setDraft).toHaveBeenCalledWith(
      "repo",
      expect.objectContaining({ message: "repair(core)!: change API\n\nDetails" }),
    );
    expect(title.value).toBe("change API");

    await act(async () => picker.click());

    const options = document.querySelectorAll("[data-eda-select-value]");

    expect(options[options.length - 1]?.getAttribute("data-eda-select-value")).toBe("");

    await act(async () =>
      (document.querySelector('[data-eda-select-value=""]') as HTMLButtonElement).click(),
    );
    expect(useSessionStore.getState().snapshot?.drafts["repo"]?.message).toBe(
      "change API\n\nDetails",
    );

    await input(title, "feat: manually typed");
    expect(title.value).toBe("manually typed");
    expect(picker.textContent).toContain("feat:");
    expect(useSessionStore.getState().snapshot?.drafts["repo"]?.message).toBe(
      "feat: manually typed\n\nDetails",
    );

    await input(title, "edited subject");
    expect(useSessionStore.getState().snapshot?.drafts["repo"]?.message).toBe(
      "feat: edited subject\n\nDetails",
    );

    await act(async () =>
      usePreferencesStore.setState({
        values: {
          ...usePreferencesStore.getState().values,
          commitPrefixes: { ...preferences.values.commitPrefixes, value: ["✨ feat", "🐛 fix"] },
        },
      }),
    );
    await input(title, "fix: emoji subject");
    expect(title.value).toBe("emoji subject");
    expect(picker.textContent).toContain("🐛 fix:");
    expect(useSessionStore.getState().snapshot?.drafts["repo"]?.message).toBe(
      "🐛 fix: emoji subject\n\nDetails",
    );

    await act(async () =>
      usePreferencesStore.setState({
        values: {
          ...preferences.values,
          conventionalCommitsEnabled: {
            ...preferences.values.conventionalCommitsEnabled,
            value: false,
          },
        },
      }),
    );
    expect(container.querySelector('[aria-label="Commit prefix"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    usePreferencesStore.setState(preferences);
    useRepositoryStore.setState(repository);
    useSessionStore.setState(session);
    useAppStore.setState(app);
    vi.unstubAllGlobals();
  }
});

it.each(["repository", "session"])(
  "does not commit after the %s changes during draft flush",
  async (change) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("eda", {
      repository: {
        previewCommit: vi.fn(async () => ({
          ok: false,
          error: errorFixture({ message: "Unavailable" }),
        })),
      },
    });
    const repository = useRepositoryStore.getState();
    const session = useSessionStore.getState();
    const app = useAppStore.getState();
    const commit = vi.fn(async () => true);
    let finish!: (saved: boolean) => void;
    const flush = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    try {
      useRepositoryStore.setState({ repositoryId: "repo", status: null, writing: false, commit });
      useAppStore.setState({ selectedRepositoryId: "repo" });
      useSessionStore.setState({
        transitioning: false,
        flush,
        snapshot: {
          context: { profileId: "profile", windowId: "window", generation: 1 },
          session: emptySession(),
          recovery: null,
          drafts: { repo: { version: 1, message: "Keep this draft", amend: true } },
        },
      });
      await act(async () => root.render(<CommitBox />));
      const submit = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Amend commit",
      )!;
      await act(async () => submit.click());
      expect(flush).toHaveBeenCalled();

      await act(async () => {
        if (change === "repository") {
          useRepositoryStore.setState({ repositoryId: "other" });
          useAppStore.setState({ selectedRepositoryId: "other" });
        } else {
          const snapshot = useSessionStore.getState().snapshot!;
          useSessionStore.setState({
            snapshot: { ...snapshot, context: { ...snapshot.context, generation: 2 } },
          });
        }
        finish(true);
      });
      expect(commit).not.toHaveBeenCalled();
      expect(useSessionStore.getState().snapshot?.drafts["repo"]?.message).toBe("Keep this draft");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      useRepositoryStore.setState(repository);
      useSessionStore.setState(session);
      useAppStore.setState(app);
      vi.unstubAllGlobals();
    }
  },
);
