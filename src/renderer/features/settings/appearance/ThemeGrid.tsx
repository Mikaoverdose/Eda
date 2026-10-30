import { t } from "@shared/i18n";
import { BUILT_IN_THEMES } from "../../../styles/themes";
import { useId } from "react";
import { cx, RadioCard } from "../../../components/ui/index";

export function ThemeGrid({
  selected,
  onChange,
  appearance,
}: {
  selected: string;
  appearance?: "light" | "dark";
  onChange: (id: string) => void;
}) {
  const groupName = useId();

  return (
    <div
      role="radiogroup"
      aria-label={
        appearance
          ? t("settings.themeGrid.theme", {
              value1:
                appearance === "light"
                  ? t("settings.themeGrid.light")
                  : t("settings.themeGrid.dark"),
            })
          : t("settings.themeGrid.themeLabel")
      }
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3"
    >
      {BUILT_IN_THEMES.filter((theme) => !appearance || theme.appearance === appearance).map(
        (t) => {
          const isActive = t.id === selected;

          return (
            <RadioCard
              key={t.id}
              name={groupName}
              value={t.id}
              checked={isActive}
              onChange={onChange}
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-10 shrink-0 overflow-hidden rounded-sm border border-border-default"
                style={{ backgroundColor: t.preview.background }}
              >
                <span className="w-1/3" style={{ backgroundColor: t.preview.surface }} />
                <span
                  className="ml-auto mt-auto h-1.5 w-4"
                  style={{ backgroundColor: t.preview.accent }}
                />
              </span>
              <span
                className={cx(
                  "flex min-w-0 flex-1 items-center gap-2 text-sm",
                  isActive ? "font-medium text-text-primary" : "text-text-secondary",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span aria-hidden="true" className="radio-control" data-checked={isActive} />
              </span>
            </RadioCard>
          );
        },
      )}
    </div>
  );
}
