import { act } from "react";
import { createRoot } from "react-dom/client";
import { AboutSettings } from "@renderer/features/settings/application/AboutSettings";
import { builtInSetting, type SettingKey } from "@shared/preferences/settings";
import { usePreferencesStore } from "@renderer/stores/preferences-store";
import { useSimulationStore } from "@renderer/stores/simulation-store";

vi.mock("@shared/integrations/github", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  MAINTAINER_GITHUB_LOGIN: "fixture-maintainer",
  MAINTAINER_EMAIL: "maintainer@example.test",
}));

it.each([
  null,
  {
    id: "7",
    login: "fixture-maintainer",
    name: "Fixture Maintainer",
    bio: "A cached bio",
    location: "Example City",
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
    const installation = vi.fn(async () => ({
      ok: true,
      value: { method: publicProfile ? "homebrew" : "development" },
    }));
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
    const previous = usePreferencesStore.getState();
    let developerSettingsEnabled = false;
    const settings = {
      resolve: vi.fn(async (key: SettingKey) => ({
        ok: true,
        value:
          key === "developerSettingsEnabled"
            ? { ...builtInSetting(key), value: developerSettingsEnabled }
            : builtInSetting(key),
      })),
      set: vi.fn(async (_key: SettingKey, _scope: unknown, value: boolean) => {
        developerSettingsEnabled = value;
        return { ok: true, value: undefined };
      }),
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
      app: { version, copyText, installation },
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
      await usePreferencesStore.getState().load({});
      await act(async () => root.render(<AboutSettings />));
      const developerToggle = container.querySelector<HTMLInputElement>(
        '[aria-labelledby="about-developer-settings-heading"] input[type="checkbox"]',
      )!;
      expect(developerToggle.checked).toBe(false);
      await act(async () => developerToggle.click());
      expect(settings.set).toHaveBeenLastCalledWith(
        "developerSettingsEnabled",
        { kind: "application" },
        true,
      );
      expect(developerToggle.checked).toBe(true);
      await act(async () => usePreferencesStore.getState().load({ profileId: "another-profile" }));
      expect(developerToggle.checked).toBe(true);
      await act(async () => developerToggle.click());
      expect(settings.set).toHaveBeenLastCalledWith(
        "developerSettingsEnabled",
        { kind: "application" },
        false,
      );
      expect(developerToggle.checked).toBe(false);
      expect(container.querySelector(".profile-avatar.ui-skeleton")).not.toBeNull();
      expect(container.querySelector('[aria-label="Copy maintainer email"]')).not.toBeNull();

      await act(async () => finishProfile());

      expect(container.querySelector('[aria-label="Loading maintainer profile"]')).toBeNull();
      expect(container.textContent).toContain(version.displayVersion);
      expect(container.querySelector(`[title="${version.commit}"]`)?.textContent).toBe(
        version.commit.slice(0, 12),
      );
      expect(container.textContent).toContain("Local changes (dirty)");
      expect(container.textContent).toContain(publicProfile ? "Homebrew" : "Development");
      expect(container.querySelector(".profile-avatar")?.textContent).toBe(
        publicProfile ? "FM" : "Y",
      );
      expect(container.querySelector(".profile-avatar img")).toBeNull();
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
      expect(container.textContent).toContain("maintainer@example.test");

      await act(async () => email.click());

      expect(copyText).toHaveBeenCalledWith("maintainer@example.test");

      const copy = container.querySelector<HTMLButtonElement>('[aria-label="Copy Eda version"]')!;

      await act(async () => copy.click());

      expect(copyText).toHaveBeenCalledWith(version.displayVersion);

      const copyCommit = container.querySelector<HTMLButtonElement>(
        '[aria-label="Copy build commit"]',
      )!;

      await act(async () => copyCommit.click());

      expect(copyText).toHaveBeenCalledWith(version.commit);

      developerSettingsEnabled = true;
      await act(async () => {
        await usePreferencesStore.getState().load({});
        useSimulationStore.getState().setUpdatePhase("available");
      });

      const installationLabel = () =>
        [...container.querySelectorAll("dt")]
          .find((label) => label.textContent === "Installation")!
          .parentElement!.querySelector("dd")!.textContent;

      for (const [method, label] of [
        ["direct", "Direct download"],
        ["homebrew", "Homebrew"],
        ["dpkg", "System package (APT / dpkg)"],
        ["rpm", "System package (RPM)"],
        ["pacman", "System package (Pacman)"],
      ] as const) {
        await act(async () => useSimulationStore.getState().setUpdateInstallation(method));

        expect(installationLabel()).toBe(label);
        expect(container.textContent).not.toContain("Update preview is active");
      }

      await act(async () => useSimulationStore.getState().setUpdatePhase(null));

      expect(installationLabel()).toBe(publicProfile ? "Homebrew" : "Development");
      expect(installation).toHaveBeenCalledOnce();

      vi.stubGlobal("eda", {
        app: {
          version: { ...version, commit: null, dirty: null, displayVersion: "0.0.1-unknown" },
          copyText,
          installation,
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
      useSimulationStore.getState().reset();
      usePreferencesStore.setState(previous);
      vi.unstubAllGlobals();
    }
  },
);
