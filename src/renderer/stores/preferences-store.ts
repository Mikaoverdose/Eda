import { errorText } from "@shared/error-codes";
import type { GitErrorData } from "@shared/errors";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import type { AccentColor } from "@shared/preferences/accent";
import {
  builtInSetting,
  themeForAppearance,
  type BackgroundPreference,
  type ResolvedSetting,
  type SettingKey,
  type SettingsContext,
  type SettingScope,
  type SettingValues,
  type ThemePreference,
} from "@shared/preferences/settings";
import { create } from "zustand";
import { applyIdentityHue, applyTheme, BUILT_IN_THEMES } from "../styles/themes";

type Values = {
  [
    K in Exclude<
      SettingKey,
      | "language"
      | "automaticUpdateChecks"
      | "hardwareAcceleration"
      | "gitEngine"
      | "sshAgent"
      | "pullStrategy"
      | "fetchPrune"
      | "fetchTags"
      | "backgroundFetchMinutes"
      | "mergeTool"
      | "repositoryCommitIdentity"
    >
  ]: ResolvedSetting<K>;
};

const defaults = (): Values => ({
  conventionalCommitsEnabled: builtInSetting("conventionalCommitsEnabled"),
  commitPrefixes: builtInSetting("commitPrefixes"),
  accentHue: builtInSetting("accentHue"),
  editorExecutable: builtInSetting("editorExecutable"),
  theme: builtInSetting("theme"),
  background: builtInSetting("background"),
  windowTransparency: builtInSetting("windowTransparency"),
  syncGlobalGitConfig: builtInSetting("syncGlobalGitConfig"),
  reducedMotion: builtInSetting("reducedMotion"),
  uiZoom: builtInSetting("uiZoom"),
  diffMode: builtInSetting("diffMode"),
});

interface PreferencesState {
  context: SettingsContext;
  values: Values;
  loading: boolean;
  saving: boolean;
  error: GitErrorData | null;
  load: (context: SettingsContext) => Promise<void>;
  set: <K extends SettingKey>(
    key: K,
    scope: SettingScope,
    value: SettingValues[K],
  ) => Promise<boolean>;
  reset: (key: SettingKey, scope: SettingScope) => Promise<boolean>;
}

let generation = 0;
let backgroundAdjustment: { value: BackgroundPreference } | null = null;
let backgroundPreview: BackgroundPreference | null = null;
let motionPreview: boolean | null = null;
let appearancePreview: ThemePreference | null = null;
let accentPreview: AccentColor | null = null;

function apply(values: Values): void {
  applyIdentityHue(accentPreview ?? values.accentHue.value);
  applyTheme(
    BUILT_IN_THEMES.find(
      (theme) =>
        theme.id ===
        themeForAppearance(
          appearancePreview ?? values.theme.value,
          window.matchMedia("(prefers-color-scheme: dark)").matches,
        ),
    ) ?? BUILT_IN_THEMES.find((theme) => theme.id === "eda-dark")!,
  );

  const background = backgroundAdjustment?.value ?? backgroundPreview ?? values.background.value;
  const root = document.documentElement;

  root.dataset["customBackground"] = String(!!background.image);

  const backgroundProperties = {
    "--background-image": background.image
      ? `url("${background.image}")`
      : root.style.getPropertyValue("--background-image") || "none",
    "--background-strength": String(background.image ? background.strength / 100 : 0),
    "--background-blur": `${background.blur}px`,
  };

  for (const [property, value] of Object.entries(backgroundProperties)) {
    if (root.style.getPropertyValue(property) !== value) root.style.setProperty(property, value);
  }

  document.documentElement.dataset["reducedMotion"] = String(
    motionPreview ?? values.reducedMotion.value,
  );
}

export const usePreferencesStore = create<PreferencesState>((set, get) => {
  const mutate = async (
    action: () => ReturnType<typeof window.eda.settings.reset>,
  ): Promise<boolean> => {
    const context = get().context;

    set({ saving: true, error: null });

    try {
      const result = await action();

      if (
        get().context.profileId !== context.profileId ||
        get().context.repositoryId !== context.repositoryId
      )
        return result.ok;

      if (!result.ok) {
        set({ error: result.error });
        return false;
      }

      await get().load(context);

      return true;
    } catch {
      set({
        error: new GitError({
          kind: "unknown",
          operation: t("operations.savePreferences"),
          message: errorText("preferencesStore.preferencesCouldNotBeSavedTryAgain"),
        }).toData(),
      });

      return false;
    } finally {
      set({ saving: false });
    }
  };

  return {
    context: {},
    values: defaults(),
    loading: false,
    saving: false,
    error: null,
    async load(context) {
      const request = ++generation;

      if (context.profileId !== get().context.profileId) {
        const values = defaults();
        set({ context, values, loading: true, error: null });
        apply(values);
      } else set({ context, loading: true });

      const [
        theme,
        sync,
        motion,
        zoom,
        diff,
        editor,
        background,
        transparency,
        accent,
        conventional,
        prefixes,
      ] = await Promise.all([
        window.eda.settings.resolve("theme", context),
        window.eda.settings.resolve("syncGlobalGitConfig", context),
        window.eda.settings.resolve("reducedMotion", context),
        window.eda.settings.resolve("uiZoom", context),
        window.eda.settings.resolve("diffMode", context),
        window.eda.settings.resolve("editorExecutable", context),
        window.eda.settings.resolve("background", context),
        window.eda.settings.resolve("windowTransparency", context),
        window.eda.settings.resolve("accentHue", context),
        window.eda.settings.resolve("conventionalCommitsEnabled", context),
        window.eda.settings.resolve("commitPrefixes", context),
      ]);

      if (request !== generation) return;

      const failure = [
        theme,
        sync,
        motion,
        zoom,
        diff,
        editor,
        background,
        transparency,
        accent,
        conventional,
        prefixes,
      ].find((result) => !result.ok);

      if (failure && !failure.ok) {
        set({ loading: false, error: failure.error });
        return;
      }

      if (
        !theme.ok ||
        !sync.ok ||
        !motion.ok ||
        !zoom.ok ||
        !diff.ok ||
        !editor.ok ||
        !background.ok ||
        !transparency.ok ||
        !accent.ok ||
        !conventional.ok ||
        !prefixes.ok
      )
        return;

      const values = {
        conventionalCommitsEnabled: conventional.value,
        commitPrefixes: prefixes.value,
        accentHue: accent.value,
        theme: theme.value,
        syncGlobalGitConfig: sync.value,
        reducedMotion: motion.value,
        uiZoom: zoom.value,
        diffMode: diff.value,
        editorExecutable: editor.value,
        background: background.value,
        windowTransparency: transparency.value,
      };

      set({ values, loading: false, error: null });
      apply(values);
    },
    set: (key, scope, value) => mutate(() => window.eda.settings.set(key, scope, value)),
    reset: (key, scope) => mutate(() => window.eda.settings.reset(key, scope)),
  };
});

export function preferenceSource(setting: ResolvedSetting): string {
  return setting.source.kind === "built-in"
    ? t("preferencesStore.builtInDefault")
    : setting.source.kind === "application"
      ? t("preferencesStore.globalDefault")
      : setting.source.kind === "profile"
        ? t("preferencesStore.profileOverride")
        : t("preferencesStore.repositoryOverride");
}

export function watchSystemAppearance(): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const update = () => apply(usePreferencesStore.getState().values);
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}

export function previewAppearance(value: ThemePreference | null): void {
  appearancePreview = value;
  apply(usePreferencesStore.getState().values);
}

export function previewAccent(value: AccentColor | null): void {
  accentPreview = value;
  apply(usePreferencesStore.getState().values);
}

export function previewMotion(value: boolean | null): void {
  motionPreview = value;
  apply(usePreferencesStore.getState().values);
}

export function previewBackground(value: BackgroundPreference | null): void {
  backgroundPreview = value;
  apply(usePreferencesStore.getState().values);
}

export function beginBackgroundAdjustment() {
  const adjustment = {
    value: backgroundPreview ?? usePreferencesStore.getState().values.background.value,
  };

  backgroundAdjustment = adjustment;

  return {
    update(value: BackgroundPreference) {
      if (backgroundAdjustment !== adjustment) return;
      adjustment.value = value;
      apply(usePreferencesStore.getState().values);
    },
    clear() {
      if (backgroundAdjustment !== adjustment) return;
      backgroundAdjustment = null;
      apply(usePreferencesStore.getState().values);
    },
  };
}
