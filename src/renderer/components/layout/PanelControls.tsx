import { t } from "@shared/i18n";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  MaximizeIcon,
  RestoreIcon,
  IconButton,
} from "../ui/index";

export type PanelState = "normal" | "maximized" | "collapsed";

const CHEVRONS = {
  left: ChevronLeftIcon,
  right: ChevronRightIcon,
  up: ChevronUpIcon,
  down: ChevronDownIcon,
} as const;

export function PanelControls({
  name,
  state,
  onToggleMaximize,
  onToggleCollapse,
  collapseDirection,
}: {
  name: string;
  state: PanelState;
  onToggleMaximize: () => void;
  onToggleCollapse?: () => void;
  collapseDirection: "left" | "right" | "up" | "down";
}) {
  const collapsed = state === "collapsed";
  const expand = { left: "right", right: "left", up: "down", down: "up" } as const;
  const Chevron = CHEVRONS[collapsed ? expand[collapseDirection] : collapseDirection];
  const MaximizeGlyph = state === "maximized" ? RestoreIcon : MaximizeIcon;

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {onToggleCollapse && (
        <IconButton
          data-panel-collapse=""
          size="xs"
          onClick={onToggleCollapse}
          aria-label={`${collapsed ? t("layout.panelControls.expand") : t("layout.panelControls.collapse")} ${name}`}
          title={`${collapsed ? t("layout.panelControls.expand") : t("layout.panelControls.collapse")} ${name}`}
          aria-expanded={!collapsed}
          icon={<Chevron size={12} aria-hidden />}
        />
      )}
      <IconButton
        size="xs"
        onClick={onToggleMaximize}
        className={state === "maximized" ? "bg-accent-muted text-accent-text" : undefined}
        aria-label={`${state === "maximized" ? t("layout.panelControls.restore") : t("layout.panelControls.maximize")} ${name}`}
        title={`${state === "maximized" ? t("layout.panelControls.restore") : t("layout.panelControls.maximize")} ${name}`}
        aria-pressed={state === "maximized"}
        icon={<MaximizeGlyph size={12} aria-hidden />}
      />
    </span>
  );
}
