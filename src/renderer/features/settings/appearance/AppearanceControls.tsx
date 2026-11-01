import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { UI_ZOOM_PRESETS, type SettingScope } from "@shared/preferences/settings";
import { useEffect, useId, useState } from "react";
import { afterViewTransition } from "../../../components/layout/hooks/useViewTransition";
import { BackgroundSettings } from "./BackgroundSettings";

import { Checkbox, Select } from "../../../components/ui/index";
import { useAppStore } from "../../../stores/app-store";
import { previewMotion, usePreferencesStore } from "../../../stores/preferences-store";

export function AppearanceControls({
  owner = "application",
  preview = false,
  active = preview,
}: {
  owner?: "application" | "profile";
  preview?: boolean;
  active?: boolean;
}) {
  const id = useId();
  const activeId = useAppStore((state) => state.activeIdentity?.id);
  const values = usePreferencesStore((state) => state.values);
  const saving = usePreferencesStore((state) => state.saving);
  const [settings, setSettings] = useState({ zoom: values.uiZoom, motion: values.reducedMotion });
  const [reading, setReading] = useState(true);
  const workspace = owner === "profile";
  const scope: SettingScope =
    workspace && activeId ? { kind: "profile", profileId: activeId } : { kind: "application" };

  useEffect(() => {
    let cancelled = false;

    setReading(true);

    const context = workspace && activeId ? { profileId: activeId } : {};

    void Promise.all([
      window.eda.settings.resolve("uiZoom", context),
      window.eda.settings.resolve("reducedMotion", context),
    ]).then(([zoom, motion]) => {
      if (cancelled) return;
      if (zoom.ok && motion.ok) setSettings({ zoom: zoom.value, motion: motion.value });
      setReading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [workspace, activeId, values]);

  useEffect(() => {
    if (preview && !reading) previewMotion(settings.motion.value);
  }, [preview, reading, settings.motion.value]);

  useEffect(() => {
    if (!preview) return;

    const setPreview = (enabled: boolean) => {
      void window.eda.settings
        .previewGlobalAppearance(enabled)
        .then((result) => {
          if (!result.ok) usePreferencesStore.setState({ error: result.error });
        })
        .catch(() => {
          usePreferencesStore.setState({
            error: new GitError({
              kind: "unknown",
              operation: t("operations.previewAppearance"),
              message: errorText("settings.appearanceControls.appearancePreviewCouldNotBeUpdated"),
            }).toData(),
          });
        });
    };

    let active = true;

    afterViewTransition(() => {
      if (active) setPreview(true);
    });

    return () => {
      active = false;
      previewMotion(null);
      afterViewTransition(() => setPreview(false));
    };
  }, [preview]);

  const change = (key: "uiZoom" | "reducedMotion", value: string) => {
    const store = usePreferencesStore.getState();
    if (value === "global") void store.reset(key, scope);
    else if (key === "uiZoom") void store.set(key, scope, Number(value));
    else void store.set(key, scope, value === "true");
  };

  return (
    <>
      <fieldset
        disabled={workspace && !activeId}
        inert={saving || reading}
        aria-busy={saving || reading}
        className="flex min-w-0 flex-col gap-5 border-t border-border-subtle pt-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <label htmlFor={`${id}-zoom`} className="text-sm font-medium">
              {t("settings.appearanceControls.interfaceScale")}
            </label>
            <p className="mt-1 text-xs text-text-secondary">
              {t("settings.appearanceControls.adjustTheSizeOfTextAndControls")}
            </p>
          </div>
          <Select
            id={`${id}-zoom`}
            aria-label={t("settings.appearanceControls.uIZoom")}
            value={
              workspace && settings.zoom.source.kind !== "profile"
                ? "global"
                : String(settings.zoom.value)
            }
            onValueChange={(value) => change("uiZoom", value)}
            surface="base"
          >
            {workspace && <option value="global">{t("common.followGlobal")}</option>}
            {Array.from(new Set([...UI_ZOOM_PRESETS, settings.zoom.value]))
              .sort((a, b) => a - b)
              .map((zoom) => (
                <option key={zoom} value={zoom}>
                  {zoom}%
                </option>
              ))}
          </Select>
        </div>
        <div className="space-y-4 border-t border-border-subtle pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium">{t("settings.appearanceControls.motion")}</h2>
              <p id={`${id}-motion-hint`} className="mt-1 text-xs text-text-secondary">
                {t("settings.appearanceControls.keepTransitionsAndAnimationsToAMinimum")}
              </p>
            </div>
            {workspace && (
              <Select
                id={`${id}-motion`}
                aria-label={t("settings.appearanceControls.reduceMotion")}
                aria-describedby={`${id}-motion-hint`}
                value={
                  settings.motion.source.kind !== "profile"
                    ? "global"
                    : String(settings.motion.value)
                }
                onValueChange={(value) => change("reducedMotion", value)}
                surface="base"
              >
                <option value="global">{t("common.followGlobal")}</option>
                <option value="true">{t("settings.appearanceControls.on")}</option>
                <option value="false">{t("settings.appearanceControls.off")}</option>
              </Select>
            )}
          </div>
          {!workspace && (
            <Checkbox
              checked={settings.motion.value}
              aria-describedby={`${id}-motion-hint`}
              onChange={(event) => change("reducedMotion", String(event.target.checked))}
            >
              {t("settings.appearanceControls.reduceMotion")}
            </Checkbox>
          )}
        </div>
      </fieldset>
      <BackgroundSettings owner={owner} preview={preview} active={active} />
    </>
  );
}
