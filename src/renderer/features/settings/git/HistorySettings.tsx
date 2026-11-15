import { t } from "@shared/i18n";
import { useEffect, useState } from "react";
import { Checkbox } from "../../../components/ui/index";
import { usePreferencesStore } from "../../../stores/preferences-store";
import { useScopedSetting } from "../hooks/useScopedSetting";

export function HistorySettings() {
  const setting = useScopedSetting("showInternalRefs", "application");
  const saving = usePreferencesStore((state) => state.saving);
  const [checked, setChecked] = useState(setting.resolved.value);

  useEffect(() => {
    if (!setting.unavailable) setChecked(setting.resolved.value);
  }, [setting.unavailable, setting.resolved.value]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">{t("historyRefs.commitHistory")}</h2>
      <Checkbox
        checked={checked}
        disabled={setting.unavailable || saving}
        onChange={(event) => {
          const previous = checked;
          setChecked(event.target.checked);
          void setting.set(event.target.checked).then((saved) => {
            if (!saved) setChecked(previous);
          });
        }}
      >
        {t("historyRefs.showInternalByDefault")}
      </Checkbox>
      <p className="text-xs text-text-secondary">{t("historyRefs.defaultDescription")}</p>
    </section>
  );
}
