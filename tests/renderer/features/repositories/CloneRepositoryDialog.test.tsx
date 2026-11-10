import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ok } from "@shared/errors";
import type { Identity } from "@shared/identity/identity";
import type { GitHubStatus } from "@shared/integrations/github";
import { CloneRepositoryDialog } from "@renderer/features/repositories/CloneRepositoryDialog";
import { useShellStore } from "@renderer/stores/shell-store";
import { useAppStore } from "@renderer/stores/app-store";

const profile: Identity = {
  id: "work",
  name: "Work",
  gitName: "Author",
  gitEmail: "work@example.com",
  hue: 210,
  signing: { format: "none", signCommits: false },
  rules: [],
  createdAt: "now",
  updatedAt: "now",
};

const connected: GitHubStatus = {
  secureStorage: true,
  account: { id: "7", login: "work-user", state: "connected" },
};

const repositories = ["eda", "website"].map((name, index) => ({
  id: String(index),
  name,
  fullName: `team/${name}`,
  cloneUrl: `https://github.com/team/${name}.git`,
  description: null,
  private: index === 0,
  archived: false,
  updatedAt: null,
}));

let root: Root;
let container: HTMLDivElement;
let previous: ReturnType<typeof useAppStore.getState>;

const refreshRepositories = vi.fn().mockResolvedValue(undefined);
const selectRepository = vi.fn();
const onClose = vi.fn();
const clone = vi.fn().mockResolvedValue(ok({ id: "cloned" }));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  previous = useAppStore.getState();
  useAppStore.setState({ activeIdentity: profile, refreshRepositories, selectRepository });

  vi.stubGlobal("eda", {
    github: {
      status: vi.fn().mockResolvedValue(ok(connected)),
      repositories: vi.fn().mockResolvedValue(ok({ repositories, nextPage: null })),
    },
    gitlab: { status: vi.fn().mockResolvedValue(ok({ secureStorage: true, account: null })) },
    gitlabSelfHosted: {
      status: vi.fn().mockResolvedValue(ok({ secureStorage: true, accounts: [] })),
      repositories: vi.fn(),
    },
    remotes: { clone },
    repository: { chooseFolder: vi.fn().mockResolvedValue(ok("/repos")) },
    operations: { list: vi.fn().mockResolvedValue(ok([])) },
    events: { onOperationsChanged: () => () => {} },
  });

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useAppStore.setState(previous, true);
  useShellStore.setState({ request: null });
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const field = (label: string) =>
  document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) =>
    item.textContent?.includes(text),
  )!;

async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("uses a connected account, filters repositories, suggests the folder and clones with saved authentication", async () => {
  await act(async () => root.render(<CloneRepositoryDialog onClose={onClose} />));
  expect(document.querySelector('[role="combobox"]')?.textContent).toContain("GitHub");
  expect(document.body.textContent).not.toContain("Cloning into");
  await fill(field("Search repositories…"), "eda");
  expect(document.body.textContent).not.toContain("team/website");
  await act(async () => button("team/eda").click());
  expect(field("Clone folder name").value).toBe("eda");

  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Browse folders..."]')!.click(),
  );

  expect(document.body.textContent).toContain("/repos/eda");
  await act(async () => button("Clone repository").click());

  expect(clone).toHaveBeenCalledWith({
    profileId: "work",
    url: "https://github.com/team/eda.git",
    parent: "/repos",
    name: "eda",
  });

  expect(refreshRepositories).toHaveBeenCalled();
  expect(selectRepository).toHaveBeenCalledWith("cloned");
  expect(onClose).toHaveBeenCalled();
});

it("keeps a URL being entered while connection checks finish and preserves an edited folder name", async () => {
  let finish!: (value: ReturnType<typeof ok<GitHubStatus>>) => void;

  vi.mocked(window.eda.github.status).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );

  await act(async () => root.render(<CloneRepositoryDialog onClose={onClose} />));
  await fill(field("Repository URL"), "git@github.com:team/eda.git");
  expect(field("Clone folder name").value).toBe("eda");
  await fill(field("Clone folder name"), "custom-name");
  await act(async () => finish(ok(connected)));
  expect(field("Repository URL").value).toBe("git@github.com:team/eda.git");
  await fill(field("Repository URL"), "/local/website.git/");
  expect(field("Clone folder name").value).toBe("custom-name");
  expect(window.eda.github.repositories).not.toHaveBeenCalled();
});

async function openSelect(label: string) {
  const control = document.querySelector<HTMLElement>(`[role="combobox"][aria-label="${label}"]`)!;

  await act(async () =>
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
  );
}

async function choose(label: string, value: string) {
  await openSelect(label);

  await act(async () =>
    document.querySelector<HTMLElement>(`[data-eda-select-value="${value}"]`)!.click(),
  );
}

it("hides unconfigured providers and routes Add provider to Integrations", async () => {
  await act(async () => root.render(<CloneRepositoryDialog onClose={onClose} />));
  await openSelect("Provider");
  expect(document.querySelector('[data-eda-select-value="github"]')).not.toBeNull();
  expect(document.querySelector('[data-eda-select-value="gitlab"]')).toBeNull();
  expect(document.querySelector('[data-eda-select-value="url"]')).not.toBeNull();

  await act(async () =>
    document.querySelector<HTMLElement>('[data-eda-select-value="add"]')!.click(),
  );

  expect(onClose).toHaveBeenCalled();
  expect(useShellStore.getState().request).toEqual({ kind: "settings", section: "integrations" });
});

it("combines name sorting, visibility filters and search without losing the selected repository", async () => {
  await act(async () => root.render(<CloneRepositoryDialog onClose={onClose} />));
  await act(async () => button("team/eda").click());
  const rows = () => [...document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
  await choose("Sort repositories", "nameDescending");

  expect(rows().map((row) => row.textContent)).toEqual([
    expect.stringContaining("website"),
    expect.stringContaining("eda"),
  ]);

  await choose("Filter repositories", "private");
  expect(rows()).toHaveLength(1);
  expect(rows()[0]!.getAttribute("aria-pressed")).toBe("true");
  expect(document.body.textContent).toContain("1 of 2 loaded");
  await fill(field("Search repositories…"), "no-match");
  expect(rows()).toHaveLength(0);
  expect(document.body.textContent).toContain("No matching repositories");
  expect(field("Clone folder name").value).toBe("eda");
});

it("loads the next page near the scroll boundary, prevents duplicate requests, and stops at the last page", async () => {
  let intersect: (() => void) | undefined;
  const disconnect = vi.fn();

  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = () =>
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
      }
      observe() {}
      disconnect = disconnect;
    },
  );

  let resolvePage!: (
    value: ReturnType<typeof ok<{ repositories: typeof repositories; nextPage: number | null }>>,
  ) => void;

  vi.mocked(window.eda.github.repositories)
    .mockResolvedValueOnce(ok({ repositories: [repositories[0]!], nextPage: 2 }))
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );

  await act(async () => root.render(<CloneRepositoryDialog onClose={onClose} />));
  expect(window.eda.github.repositories).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).not.toContain("Load more");

  await act(async () => {
    intersect!();
    intersect!();
  });

  expect(window.eda.github.repositories).toHaveBeenCalledTimes(2);
  expect(window.eda.github.repositories).toHaveBeenLastCalledWith("work", 2);
  expect(document.body.textContent).toContain("Loading more…");
  expect(disconnect).toHaveBeenCalled();
  await act(async () => resolvePage(ok({ repositories: [repositories[1]!], nextPage: null })));
  expect(document.body.textContent).toContain("2 of 2 loaded");
  expect(document.body.textContent).not.toContain("Loading more…");
  expect(window.eda.github.repositories).toHaveBeenCalledTimes(2);
});

it("browses multiple self-hosted instances separately even when account and project IDs are identical", async () => {
  const instances = ["https://git.company.test/gitlab", "https://other.company.test"];

  vi.mocked(window.eda.gitlabSelfHosted.status).mockResolvedValue(
    ok({
      secureStorage: true,
      accounts: instances.map((baseUrl) => ({
        id: "7",
        login: "work-user",
        baseUrl,
        ignoreTlsErrors: false,
        state: "connected",
      })),
    }),
  );

  vi.mocked(window.eda.gitlabSelfHosted.repositories).mockImplementation(
    async (_profile, baseUrl) =>
      ok({
        repositories: [
          {
            ...repositories[0]!,
            id: "1",
            fullName: baseUrl === instances[0] ? "team/first" : "team/second",
            cloneUrl: `${baseUrl}/team/eda.git`,
          },
        ],
        nextPage: null,
      }),
  );

  await act(async () => root.render(<CloneRepositoryDialog onClose={onClose} />));
  await choose("Provider", `gitlab-self-hosted:${instances[0]}`);

  expect(window.eda.gitlabSelfHosted.repositories).toHaveBeenLastCalledWith(
    "work",
    instances[0],
    1,
  );

  expect(document.body.textContent).toContain("team/first");
  await choose("Provider", `gitlab-self-hosted:${instances[1]}`);

  expect(window.eda.gitlabSelfHosted.repositories).toHaveBeenLastCalledWith(
    "work",
    instances[1],
    1,
  );

  expect(document.body.textContent).toContain("team/second");
  expect(document.body.textContent).not.toContain("team/first");
});
