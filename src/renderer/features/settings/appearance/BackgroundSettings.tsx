import { MIN_WINDOW_OPACITY, type BackgroundPreference } from "@shared/preferences/settings";
import { BackgroundImageControls } from "./BackgroundImageControls";
import { t } from "@shared/i18n";

import { useAppStore } from "../../../stores/app-store";
import { useEffect, useRef } from "react";
import { ImagePlusIcon as ImagePlus } from "../../../components/ui/icons";
import { AsyncButton, Button, Checkbox, Select, RangeField } from "../../../components/ui/index";
import { useScopedSetting } from "../hooks/useScopedSetting";
import {
  beginBackgroundAdjustment,
  previewBackground,
  usePreferencesStore,
} from "../../../stores/preferences-store";

export function BackgroundSettings({
  owner,
  preview,
  active,
}: {
  owner: "application" | "profile";
  preview: boolean;
  active: boolean;
}) {
  const background = useScopedSetting("background", owner);
  const transparency = useScopedSetting("windowTransparency", owner);
  const saving = usePreferencesStore((state) => state.saving);
  const value = background.resolved.value;
  const windowValue = transparency.resolved.value;
  const workspace = owner === "profile";
  const supported = window.eda.app.platform !== "linux";
  const profileId = useAppStore((state) => state.activeIdentity?.id);
  const adjustment = useRef<ReturnType<typeof beginBackgroundAdjustment> | null>(null);

  useEffect(() => {
    if (!active) return;
    return () => {
      adjustment.current?.clear();
      adjustment.current = null;
    };
  }, [active, profileId]);

  const showAdjustment = (next: BackgroundPreference) => {
    if (!active) return;
    adjustment.current ??= beginBackgroundAdjustment();
    adjustment.current.update(next);
  };
  const cancelAdjustment = () => {
    adjustment.current?.clear();
    adjustment.current = null;
  };
  const saveAdjustment = async (next: BackgroundPreference) => {
    showAdjustment(next);

    const pending = adjustment.current;
    const saved = await background.set(next);

    if (pending && adjustment.current === pending) {
      if (preview) previewBackground(saved ? next : value);
      pending.clear();
      adjustment.current = null;
    }

    return saved;
  };

  useEffect(() => {
    if (preview && !background.unavailable) previewBackground(value);
  }, [preview, background.unavailable, value]);

  useEffect(() => {
    if (!preview) return;
    return () => previewBackground(null);
  }, [preview]);

  return (
    <div className="space-y-6 border-t border-border-subtle pt-6">
      <fieldset
        inert={background.unavailable || saving}
        aria-busy={background.reading || saving}
        className="min-w-0 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">
              {t("settings.backgroundSettings.backgroundImage")}
            </h2>

            <p className="mt-1 text-xs text-text-secondary">
              {t(
                "settings.backgroundSettings.addAPersonalBackdropLowerStrengthKeepsTextEasierToRead",
              )}
            </p>
          </div>

          {workspace && (
            <Select
              aria-label={t("settings.backgroundSettings.backgroundImageSource")}
              value={background.following ? "global" : "custom"}
              onValueChange={(next) =>
                void (next === "global" ? background.reset() : background.set(value))
              }
            >
              <option value="global">{t("common.followGlobal")}</option>

              <option value="custom">{t("settings.backgroundSettings.customize")}</option>
            </Select>
          )}
        </div>

        <fieldset disabled={background.following} className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            {value.image && (
              <img
                src={value.image}
                alt={t("settings.backgroundSettings.selectedBackground")}
                className="block h-auto max-h-28 w-auto max-w-48 shrink-0 rounded-md border border-border-subtle"
              />
            )}

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap gap-2">
                <AsyncButton
                  size="sm"
                  label={t("settings.backgroundSettings.chooseBackgroundImage")}
                  icon={<ImagePlus size={16} />}
                  onAction={async () => {
                    const result = await window.eda.settings.chooseBackgroundImage();
                    if (!result.ok) {
                      usePreferencesStore.setState({ error: result.error });
                      return false;
                    }
                    return result.value ? background.set({ ...value, image: result.value }) : true;
                  }}
                >
                  {value.image
                    ? t("settings.backgroundSettings.changeImage")
                    : t("settings.backgroundSettings.chooseImage")}
                </AsyncButton>

                {value.image && (
                  <Button size="sm" onClick={() => void background.set({ ...value, image: "" })}>
                    {t("settings.backgroundSettings.removeImage")}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {value.image && (
            <div className="grid gap-5 sm:grid-cols-2">
              <BackgroundImageControls
                value={value}
                strengthLabel={t("settings.backgroundSettings.imageStrength")}
                blurLabel={t("settings.backgroundSettings.imageBlur")}
                onPreview={showAdjustment}
                onCancel={cancelAdjustment}
                onCommit={saveAdjustment}
              />
            </div>
          )}
        </fieldset>
      </fieldset>

      <fieldset
        disabled={!supported}
        inert={transparency.unavailable || saving}
        aria-busy={transparency.reading || saving}
        className="min-w-0 space-y-4 border-t border-border-subtle pt-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">
              {t("settings.backgroundSettings.windowTransparency")}
            </h2>

            <p className="mt-1 text-xs text-text-secondary">
              {supported
                ? t(
                    "settings.backgroundSettings.seeThroughTheWindowThisAlsoMakesTextAndControlsTranslucent",
                  )
                : t("settings.backgroundSettings.linuxWindowTransparencyIsNotAvailableInEdaYet")}
            </p>
          </div>

          {workspace && (
            <Select
              aria-label={t("settings.backgroundSettings.windowTransparencySource")}
              value={transparency.following ? "global" : "custom"}
              onValueChange={(next) =>
                void (next === "global" ? transparency.reset() : transparency.set(windowValue))
              }
            >
              <option value="global">{t("common.followGlobal")}</option>

              <option value="custom">{t("settings.backgroundSettings.customize")}</option>
            </Select>
          )}
        </div>

        <fieldset disabled={transparency.following} className="min-w-0 space-y-4">
          <Checkbox
            checked={windowValue.enabled}
            onChange={(event) =>
              void transparency.set({ ...windowValue, enabled: event.target.checked })
            }
          >
            {t("settings.backgroundSettings.enableTransparency")}
          </Checkbox>

          {windowValue.enabled && (
            <RangeField
              label={t("settings.backgroundSettings.windowOpacity")}
              min={MIN_WINDOW_OPACITY}
              value={windowValue.opacity}
              onCommit={(opacity) => transparency.set({ ...windowValue, opacity })}
            />
          )}
        </fieldset>
      </fieldset>
    </div>
  );
}
