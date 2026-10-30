import { t } from "@shared/i18n";
import { useEffect } from "react";
import { HuePicker, Select } from "../../../components/ui/index";
import { previewAccent, usePreferencesStore } from "../../../stores/preferences-store";
import { useScopedSetting } from "../hooks/useScopedSetting";
import { useAppStore } from "../../../stores/app-store";

export function AccentSettings({
  owner,
  preview = false,
}: {
  owner: "application" | "profile";
  preview?: boolean;
}) {
  const accent = useScopedSetting("accentHue", owner);
  const profileId = useAppStore((state) => state.activeIdentity?.id);
  const saving = usePreferencesStore((state) => state.saving);
  const hue = accent.resolved.value;

  useEffect(() => {
    if (preview && !accent.reading) previewAccent(hue);
  }, [preview, accent.reading, hue]);

  useEffect(() => {
    if (!preview) return;
    return () => previewAccent(null);
  }, [preview]);

  return (
    <fieldset
      inert={saving || accent.reading}
      aria-busy={saving || accent.reading}
      className="space-y-4 border-t border-border-subtle pt-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">{t("settings.accentSettings.accentColor")}</h2>
          <p className="mt-1 text-xs text-text-secondary">
            {t("settings.accentSettings.colorForHighlightsControlsAndProfileAvatars")}
          </p>
        </div>
        {owner === "profile" && (
          <Select
            aria-label={t("settings.accentSettings.accentColorSource")}
            value={accent.following ? "global" : "custom"}
            onValueChange={(value) => void (value === "global" ? accent.reset() : accent.set(hue))}
          >
            <option value="global">{t("common.followGlobal")}</option>
            <option value="custom">{t("settings.accentSettings.customize")}</option>
          </Select>
        )}
      </div>
      <fieldset disabled={accent.following}>
        <HuePicker
          key={`${owner}:${profileId}`}
          label={t("settings.accentSettings.accentColor")}
          value={hue}
          onChange={accent.set}
        />
      </fieldset>
    </fieldset>
  );
}
