import { t } from "@shared/i18n";
import { GRAPH_COLUMN_IDS } from "@shared/preferences/graph-view";
import { useEffect, useId, useState } from "react";
import { Checkbox, Select } from "../../../components/ui/index";
import { usePreferencesStore } from "../../../stores/preferences-store";
import { useScopedSetting } from "../hooks/useScopedSetting";

export function HistoryColumnsSettings({
  owner = "application",
}: {
  owner?: "application" | "profile";
}) {
  const columns = useScopedSetting("historyVisibleColumns", owner);
  const columnsDescription = useId();
  const saving = usePreferencesStore((state) => state.saving);
  const [visibleColumns, setVisibleColumns] = useState(columns.resolved.value);

  useEffect(() => {
    if (!columns.unavailable) setVisibleColumns(columns.resolved.value);
  }, [columns.unavailable, columns.resolved.value]);

  return (
    <section className="space-y-3 border-t border-border-subtle pt-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">{t("historyRefs.commitHistory")}</h2>
          <p className="mt-1 text-xs text-text-secondary">
            {t(
              owner === "profile"
                ? "graphColumns.profileDescription"
                : "graphColumns.globalDescription",
            )}
          </p>
        </div>

        {owner === "profile" && (
          <Select
            aria-label={t("graphColumns.visibilitySource")}
            disabled={columns.unavailable || saving}
            value={columns.following ? "global" : "custom"}
            onValueChange={(value) =>
              void (value === "global" ? columns.reset() : columns.set(columns.resolved.value))
            }
          >
            <option value="global">{t("common.followGlobal")}</option>
            <option value="custom">{t("graphColumns.customize")}</option>
          </Select>
        )}
      </div>

      <fieldset
        className="space-y-2"
        disabled={columns.unavailable || saving || columns.following}
        aria-describedby={columnsDescription}
      >
        <legend className="mb-2 text-sm font-medium">{t("graphColumns.visibleColumns")}</legend>
        <div className="flex flex-wrap gap-4">
          {GRAPH_COLUMN_IDS.map((id) => (
            <Checkbox
              key={id}
              checked={visibleColumns.includes(id)}
              onChange={(event) => {
                const previous = visibleColumns;
                const visible = event.target.checked;
                const next = GRAPH_COLUMN_IDS.filter((column) =>
                  column === id ? visible : visibleColumns.includes(column),
                );
                setVisibleColumns(next);
                void columns.set(next).then((saved) => {
                  if (!saved) setVisibleColumns(previous);
                });
              }}
            >
              {t(`graphColumns.${id}`)}
            </Checkbox>
          ))}
        </div>
        <p id={columnsDescription} className="text-xs text-text-secondary">
          {t("graphColumns.visibilityDescription")}
        </p>
      </fieldset>
    </section>
  );
}
