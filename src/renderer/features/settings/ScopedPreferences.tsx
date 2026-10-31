import { t } from "@shared/i18n";
import { useEffect, useState } from "react";
import {
  builtInSetting,
  type ResolvedSetting,
  type SettingScope,
} from "@shared/preferences/settings";
import { useAppStore } from "../../stores/app-store";
import { previewAppearance, usePreferencesStore } from "../../stores/preferences-store";
import { Button, Checkbox, NoticeBanner } from "../../components/ui/index";
import { CommitPrefixSettings } from "./git/CommitPrefixSettings";
import { ThemePreferences } from "./appearance/ThemePreferences";

interface ScopedPreferencesProps {
  owner: "application" | "profile";
  section: "appearance" | "git";
  preview?: boolean;
}

export function ScopedPreferences(props: ScopedPreferencesProps) {
  const profileId = useAppStore((state) => state.activeIdentity?.id);

  return <ScopedPreferencesContent key={JSON.stringify([props.owner, profileId])} {...props} />;
}

function ScopedPreferencesContent({ owner, section, preview = false }: ScopedPreferencesProps) {
  const active = useAppStore((state) => state.activeIdentity);
  const switching = useAppStore((state) => state.switchingIdentityId);
  const values = usePreferencesStore((state) => state.values);
  const loading = usePreferencesStore((state) => state.loading);
  const saving = usePreferencesStore((state) => state.saving);
  const [theme, setTheme] = useState<ResolvedSetting<"theme">>(() => builtInSetting("theme"));
  const [sync, setSync] = useState<ResolvedSetting<"syncGlobalGitConfig">>(() =>
    builtInSetting("syncGlobalGitConfig"),
  );
  const [reading, setReading] = useState(true);
  const [following, setFollowing] = useState(false);
  const scope: SettingScope =
    owner === "profile" && active
      ? { kind: "profile", profileId: active.id }
      : { kind: "application" };

  useEffect(() => {
    if (switching !== null) return;
    let cancelled = false;

    setReading(true);

    const context = owner === "profile" && active ? { profileId: active.id } : {};

    void Promise.all([
      window.eda.settings.resolve("theme", context),
      window.eda.settings.resolve("syncGlobalGitConfig", context),
    ])
      .then(([appearance, gitSync]) => {
        if (cancelled) return;
        if (!appearance.ok || !gitSync.ok) {
          usePreferencesStore.setState({
            error: !appearance.ok ? appearance.error : !gitSync.ok ? gitSync.error : null,
          });
          return;
        }
        setTheme(appearance.value);
        setSync(gitSync.value);
        setReading(false);
      })
      .catch(() => {
        if (!cancelled)
          usePreferencesStore.setState({
            error: {
              kind: "unknown",
              operation: t("operations.readPreferences"),
              message: t("settings.scopedPreferences.couldNotReadApplicationPreferences"),
            },
          });
      });

    return () => {
      cancelled = true;
    };
  }, [owner, active, values, switching]);

  useEffect(() => {
    if (preview && !reading) previewAppearance(theme.value);
  }, [preview, reading, theme]);

  useEffect(() => {
    if (!preview) return;
    return () => previewAppearance(null);
  }, [preview]);

  const hasAppearanceOverrides = [
    values.theme,
    values.accentHue,
    values.uiZoom,
    values.reducedMotion,
    values.background,
    values.windowTransparency,
  ].some((setting) => setting.source.kind === "profile");

  const followGlobalAppearance = async () => {
    if (!active) return;

    const target = { kind: "profile", profileId: active.id } as const;

    setFollowing(true);

    try {
      for (const key of [
        "theme",
        "accentHue",
        "uiZoom",
        "reducedMotion",
        "background",
        "windowTransparency",
      ] as const) {
        if (useAppStore.getState().activeIdentity?.id !== target.profileId) return;
        if (!(await usePreferencesStore.getState().reset(key, target))) return;
      }
    } finally {
      setFollowing(false);
    }
  };

  const resettable = (setting: ResolvedSetting) => setting.source.kind === scope.kind;

  return (
    <fieldset
      inert={loading || reading || saving || following}
      aria-busy={loading || reading || saving || following}
      className="flex min-w-0 flex-col gap-6"
    >
      {section === "appearance" && (
        <div className="space-y-4">
          {preview && active && hasAppearanceOverrides && (
            <NoticeBanner
              tone="warning"
              action={
                <Button size="sm" variant="secondary" onClick={() => void followGlobalAppearance()}>
                  {t("settings.scopedPreferences.followGlobalForAllAppearance")}
                </Button>
              }
            >
              <p className="font-medium">
                {t("settings.scopedPreferences.previewingGlobalAppearance")}
              </p>
              <p>{t("settings.scopedPreferences.profileOverridesReturnWhenYouLeaveThisPage")}</p>
            </NoticeBanner>
          )}
          <ThemePreferences
            value={theme.value}
            inheritance={
              owner === "profile"
                ? {
                    following: theme.source.kind !== "profile",
                    onFollow: () => void usePreferencesStore.getState().reset("theme", scope),
                  }
                : undefined
            }
            onChange={(value) => {
              const previous = theme;

              setTheme({ ...theme, value, source: scope });
              void usePreferencesStore
                .getState()
                .set("theme", scope, value)
                .then((saved) => {
                  if (
                    !saved &&
                    (owner === "application" ||
                      useAppStore.getState().activeIdentity?.id === active?.id)
                  )
                    setTheme(previous);
                });
            }}
          />
        </div>
      )}
      {section === "git" && <CommitPrefixSettings key={`${owner}:${active?.id}`} scope={scope} />}
      {section === "git" && (
        <div className="border-b border-border-subtle pb-4">
          <h2 className="mb-3 text-sm font-medium">
            {t("settings.scopedPreferences.gitConfiguration")}
          </h2>
          <Checkbox
            className="flex items-center gap-3 text-sm"
            checked={sync.value}
            onChange={(event) => {
              const previous = sync;

              setSync({ ...sync, value: event.target.checked });
              void usePreferencesStore
                .getState()
                .set("syncGlobalGitConfig", scope, event.target.checked)
                .then((saved) => {
                  if (
                    !saved &&
                    (owner === "application" ||
                      useAppStore.getState().activeIdentity?.id === active?.id)
                  )
                    setSync(previous);
                });
            }}
          >
            {owner === "profile"
              ? t("settings.scopedPreferences.syncThisProfileSIdentityToGit")
              : t("settings.scopedPreferences.syncProfileIdentitiesToGit")}
          </Checkbox>
          <p className="mt-2 text-xs leading-relaxed text-text-secondary">
            {owner === "profile"
              ? t("settings.scopedPreferences.updateGlobalGitAuthorAndSigningSettingsWhenMessage")
              : t("settings.scopedPreferences.updateGlobalGitAuthorAndSigningSettingsWhen")}
          </p>
          {owner === "profile" && resettable(sync) && (
            <div className="mt-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void usePreferencesStore.getState().reset("syncGlobalGitConfig", scope)
                }
              >
                {t("common.followGlobal")}
              </Button>
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}
