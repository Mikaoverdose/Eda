import { LanguageSettings } from "./LanguageSettings";
import { t } from "@shared/i18n";
import { GraphicsSettings } from "./GraphicsSettings";
import { useScopedSetting } from "../hooks/useScopedSetting";
import { usePreferencesStore } from "../../../stores/preferences-store";
import { useEffect, useId, useState } from "react";
import type { DetectedEditor } from "@shared/integrations/editor";
import { ErrorDialog, Select } from "../../../components/ui/index";
import { MergeToolSettings } from "../git/MergeToolSettings";

export function ApplicationPreferences({
  owner = "application",
}: {
  owner?: "application" | "profile";
}) {
  const editor = useScopedSetting("editorExecutable", owner);
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [editors, setEditors] = useState<DetectedEditor[]>([]);
  const [detecting, setDetecting] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const saving = usePreferencesStore((state) => state.saving);
  const selected = editor.resolved.value;

  useEffect(() => {
    let cancelled = false;

    void window.eda.app
      .detectEditors()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setEditors(result.value);
        else setError(result.error.message);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            t("settings.applicationPreferences.couldNotDetectEditorsYouCanStillChooseOneManually"),
          );
      })
      .finally(() => {
        if (!cancelled) setDetecting(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (value: string) => {
    setError(null);
    setChoosing(true);

    try {
      if (value === "global") {
        await editor.reset();
      } else if (value === "none") {
        await editor.set("");
      } else if (value === "manual") {
        const result = await window.eda.app.chooseEditor();
        if (!result.ok) setError(result.error.message);
        else if (result.value) await editor.set(result.value);
      } else {
        await editor.set(value);
      }
    } catch {
      setError(t("settings.applicationPreferences.couldNotSelectTheEditorTryAgain"));
    } finally {
      setChoosing(false);
    }
  };

  return (
    <fieldset
      inert={saving || choosing || editor.reading}
      aria-busy={saving || choosing || editor.reading}
      className="flex flex-col gap-5"
    >
      {owner === "application" && <LanguageSettings />}
      <div className="space-y-2">
        <label htmlFor={id} className="text-sm font-medium">
          {t("settings.applicationPreferences.externalEditor")}
        </label>
        <p className="text-xs text-text-secondary">
          {t("settings.applicationPreferences.openRepositoriesInYourPreferredEditor")}
        </p>
        <Select
          id={id}
          value={editor.following ? "global" : selected || "none"}
          onValueChange={(value) => void choose(value)}
          surface="base"
        >
          {owner === "profile" && <option value="global">{t("common.followGlobal")}</option>}
          <option value="none">{t("common.none")}</option>
          {editors.map((editor) => (
            <option key={editor.executable} value={editor.executable}>
              {editor.name}
            </option>
          ))}
          {selected && !editors.some((editor) => editor.executable === selected) && (
            <option value={selected}>
              {t("settings.applicationPreferences.customEditor", {
                value1: selected.split(/[\\/]/).pop(),
              })}
            </option>
          )}
          <option value="manual">{t("settings.applicationPreferences.chooseManually")}</option>
        </Select>
        {detecting ? (
          <p role="status" className="text-xs text-text-tertiary">
            {t("settings.applicationPreferences.lookingForInstalledEditors")}
          </p>
        ) : (
          editors.length === 0 && (
            <p className="text-xs text-text-tertiary">
              {t("settings.applicationPreferences.noEditorsDetectedChooseAnExecutableManually")}
            </p>
          )
        )}
        {selected && <p className="break-all text-xs text-text-tertiary">{selected}</p>}
        <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      </div>
      <MergeToolSettings owner={owner} />
      {owner === "application" && <GraphicsSettings />}
    </fieldset>
  );
}
