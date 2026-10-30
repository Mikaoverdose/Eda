import { t } from "@shared/i18n";
import { ButtonBase } from "../ui/actions/ButtonBase";
import { cx } from "../ui/cx";
import { ChevronLeftIcon, ChevronRightIcon } from "../ui/index";

export function CollapsedRail({
  name,
  badge,
  onExpand,
  side,
  horizontal = false,
}: {
  name: string;
  badge?: string | undefined;
  onExpand: () => void;
  side: "left" | "right";
  horizontal?: boolean;
}) {
  return (
    <ButtonBase
      type="button"
      onClick={onExpand}
      title={t("layout.collapsedRail.expand", { name: name })}
      aria-label={t("layout.collapsedRail.expand", { name: name })}
      aria-expanded={false}
      style={
        horizontal
          ? { height: "var(--panel-rail-size)", width: "100%" }
          : { width: "var(--panel-rail-size)" }
      }
      className={cx(
        "app-surface-panel group flex shrink-0 items-center gap-2",
        horizontal ? "flex-row border-b px-3" : "h-full flex-col py-2",
        side === "left" ? "border-l border-border-subtle" : "border-r border-border-subtle",
      )}
    >
      <span
        aria-hidden="true"
        className="ui-interactive text-text-tertiary group-hover:text-text-primary"
      >
        {side === "left" ? <ChevronLeftIcon size={12} /> : <ChevronRightIcon size={12} />}
      </span>

      {badge && (
        <span className="mono rounded-sm bg-bg-raised px-1 text-xs leading-tight text-text-tertiary">
          {badge}
        </span>
      )}

      <span
        className="ui-interactive mono whitespace-nowrap text-xs uppercase tracking-wide text-text-tertiary group-hover:text-text-secondary"
        style={horizontal ? undefined : { writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        {name}
      </span>
    </ButtonBase>
  );
}
