import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import {
  builtInSetting,
  type ResolvedSetting,
  type SettingKey,
  type SettingScope,
  type SettingValues,
} from "@shared/preferences/settings";
import { useEffect, useState } from "react";
import { useAppStore } from "../../../stores/app-store";
import { usePreferencesStore } from "../../../stores/preferences-store";

export function useScopedSetting<K extends SettingKey>(
  key: K,
  owner: "application" | "profile" | "repository",
  repositoryId?: string,
) {
  const profileId = useAppStore((state) => state.activeIdentity?.id);
  const switching = useAppStore((state) => state.switchingIdentityId);
  const values = usePreferencesStore((state) => state.values);
  const contextKey = JSON.stringify([
    key,
    owner,
    owner !== "application" ? profileId : null,
    repositoryId,
  ]);
  const [result, setResult] = useState<{
    contextKey: string;
    value: ResolvedSetting<K> | null;
  } | null>(null);
  const resolved =
    result?.contextKey === contextKey ? (result.value ?? builtInSetting(key)) : builtInSetting(key);
  const [reading, setReading] = useState(true);
  let scope: SettingScope = { kind: "application" };

  if (owner === "repository" && profileId && repositoryId)
    scope = { kind: "repository", profileId, repositoryId };
  else if (owner === "profile" && profileId) scope = { kind: "profile", profileId };

  const unavailable =
    reading ||
    switching !== null ||
    result?.contextKey !== contextKey ||
    !result.value ||
    (owner !== "application" && !profileId) ||
    (owner === "repository" && !repositoryId);

  useEffect(() => {
    if (switching !== null) return;
    let cancelled = false;

    setReading(true);
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
        else {
          setResult({ contextKey, value: null });
          usePreferencesStore.setState({ error: result.error });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setResult({ contextKey, value: null });
        usePreferencesStore.setState({
          error: new GitError({
            kind: "unknown",
            operation: t("operations.readPreferences"),
            message: errorText("settings.useScopedSetting.couldNotReadApplicationPreferences"),
          }).toData(),
        });
      })
      .finally(() => {
        if (!cancelled) setReading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key, owner, profileId, repositoryId, values, contextKey, switching]);

  const valid = () =>
    !unavailable &&
    (owner === "application" ||
      (!!profileId &&
        useAppStore.getState().activeIdentity?.id === profileId &&
        (owner !== "repository" ||
          (!!repositoryId && useAppStore.getState().selectedRepositoryId === repositoryId))));

  return {
    resolved,
    reading: reading || result?.contextKey !== contextKey,
    unavailable,
    following: owner !== "application" && resolved.source.kind !== owner,
    set: (value: SettingValues[K]) =>
      valid() ? usePreferencesStore.getState().set(key, scope, value) : Promise.resolve(false),
    reset: () =>
      valid() ? usePreferencesStore.getState().reset(key, scope) : Promise.resolve(false),
  };
}
