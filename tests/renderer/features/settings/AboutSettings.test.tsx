import { act } from "react";
import { createRoot } from "react-dom/client";
import { AboutSettings } from "@renderer/features/settings/application/AboutSettings";
import { builtInSetting, type SettingKey } from "@shared/preferences/settings";

it.each([
  null,
  {
    id: "7",
    login: "YuzuZensai",
    name: "Yuzu",
    bio: "A cached bio",
    location: "Japan / Thailand",
    avatarDataUrl: null,
  },
])(
  "keeps build identity and maintainer contact available with public profile %j when Gravatar is unavailable",
  async (publicProfile) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const version = {
      version: "0.0.1",
      displayVersion: "0.0.1-abcdef123456-dirty",
      commit: "abcdef123456".padEnd(40, "0"),
      dirty: true,
    };
    const copyText = vi.fn(async () => ({ ok: true, value: undefined }));
    const get = vi.fn(async () => {
      throw new Error("Offline");
    });
    const updates = {
      state: vi.fn(async () => ({
        ok: true,
        value: {
          revision: 0,
          capability: "development",
          phase: "idle",
          reason: "Development builds are never replaced.",
          feedUrl: null,
          checkedAt: null,
          release: null,
          progress: null,
          error: null,
        },
      })),
    };
    const events = { onUpdateChanged: vi.fn(() => () => {}) };
    const settings = {
      resolve: vi.fn(async (key: SettingKey) => ({ ok: true, value: builtInSetting(key) })),
    };
    let finishProfile!: () => void;
    const github = {
      maintainerProfile: vi.fn(
        () =>
          new Promise((resolve, reject) => {
            finishProfile = () => {
              if (!publicProfile) reject(new Error("Offline"));
              else resolve({ ok: true, value: publicProfile });
            };
          }),
      ),
    };
    vi.stubGlobal("eda", {
      app: { version, copyText },
      avatars: { get },
      updates,
      events,
      settings,
      github,
    });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(<AboutSettings />));
      expect(
        container.querySelector('[role="status"][aria-label="Loading maintainer profile"]'),
      ).not.toBeNull();
      expect(container.querySelector(".profile-avatar")).toBeNull();
      expect(container.querySelector('[aria-label="Copy maintainer email"]')).toBeNull();

      await act(async () => finishProfile());

      expect(container.querySelector('[aria-label="Loading maintainer profile"]')).toBeNull();
      expect(container.textContent).toContain(version.displayVersion);
      expect(container.querySelector(`[title="${version.commit}"]`)?.textContent).toBe(
        version.commit.slice(0, 12),
      );
      expect(container.textContent).toContain("Local changes (dirty)");
      expect(container.querySelector(".profile-avatar")?.textContent).toBe("Y");
      expect(container.querySelector("img")).toBeNull();
      expect(github.maintainerProfile).toHaveBeenCalledOnce();

      if (publicProfile) {
        expect(container.textContent).toContain(publicProfile.bio);
        expect(container.textContent).toContain(publicProfile.location);
      }

      const email = container.querySelector<HTMLButtonElement>(
        '[aria-label="Copy maintainer email"]',
      )!;

      expect(email.title).toBe("Copy maintainer email");
      expect(email.querySelector("svg")).not.toBeNull();
      expect(container.textContent).toContain("yuzu@kirameki.cafe");

      await act(async () => email.click());

      expect(copyText).toHaveBeenCalledWith("yuzu@kirameki.cafe");

      const copy = container.querySelector<HTMLButtonElement>('[aria-label="Copy Eda version"]')!;

      await act(async () => copy.click());

      expect(copyText).toHaveBeenCalledWith(version.displayVersion);

      const copyCommit = container.querySelector<HTMLButtonElement>(
        '[aria-label="Copy build commit"]',
      )!;

      await act(async () => copyCommit.click());

      expect(copyText).toHaveBeenCalledWith(version.commit);

      vi.stubGlobal("eda", {
        app: {
          version: { ...version, commit: null, dirty: null, displayVersion: "0.0.1-unknown" },
          copyText,
        },
        avatars: { get },
        updates,
        events,
        settings,
        github,
      });

      await act(async () => root.render(<AboutSettings />));

      expect(container.textContent).toContain("0.0.1-unknown");
      expect(container.textContent).toContain("Unknown");
      expect(container.querySelector('[aria-label="Copy build commit"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);
