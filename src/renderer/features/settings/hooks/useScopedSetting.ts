import { t } from "@shared/i18n";
import { useEffect, useState } from "react";
import {
  builtInSetting,
  type ResolvedSetting,
  type SettingKey,
  type SettingScope,
  type SettingValues,
} from "@shared/preferences/settings";
import { useAppStore } from "../../../stores/app-store";
import { usePreferencesStore } from "../../../stores/preferences-store";

export function useScopedSetting<K extends SettingKey>(
  key: K,
  owner: "application" | "profile" | "repository",
  repositoryId?: string,
) {
  const profileId = useAppStore((state) => state.activeIdentity?.id);
  const values = usePreferencesStore((state) => state.values);
  const contextKey = JSON.stringify([
    key,
    owner,
    owner !== "application" ? profileId : null,
    repositoryId,
  ]);
  const [result, setResult] = useState<{ contextKey: string; value: ResolvedSetting<K> } | null>(
    null,
  );
  const resolved = result?.contextKey === contextKey ? result.value : builtInSetting(key);
  const [reading, setReading] = useState(true);
  const scope: SettingScope =
    owner === "repository" && profileId && repositoryId
      ? { kind: "repository", profileId, repositoryId }
      : owner === "profile" && profileId
        ? { kind: "profile", profileId }
        : { kind: "application" };

  useEffect(() => {
    let cancelled = false;

    setReading(true);
    setResult(null);
    void window.eda.settings
      .resolve(
        key,
        owner !== "application" && profileId
          ? { profileId, ...(owner === "repository" && repositoryId ? { repositoryId } : {}) }
          : {},
      )
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setResult({ contextKey, value: result.value });
        else usePreferencesStore.setState({ error: result.error });
      })
      .catch(() => {
        if (!cancelled)
          usePreferencesStore.setState({
            error: {
              kind: "unknown",
              operation: t("operations.readPreferences"),
              message: t("settings.useScopedSetting.couldNotReadApplicationPreferences"),
            },
          });
      })
      .finally(() => {
        if (!cancelled) setReading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key, owner, profileId, repositoryId, values, contextKey]);

  const valid = () =>
    owner === "application" ||
    (!!profileId &&
      useAppStore.getState().activeIdentity?.id === profileId &&
      (owner !== "repository" ||
        (!!repositoryId && useAppStore.getState().selectedRepositoryId === repositoryId)));

  return {
    resolved,
    reading:
      reading || result?.contextKey !== contextKey || (owner !== "application" && !profileId),
    following: owner !== "application" && resolved.source.kind !== owner,
    set: (value: SettingValues[K]) =>
      valid() ? usePreferencesStore.getState().set(key, scope, value) : Promise.resolve(false),
    reset: () =>
      valid() ? usePreferencesStore.getState().reset(key, scope) : Promise.resolve(false),
  };
}
