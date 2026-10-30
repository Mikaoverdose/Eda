import { cx } from "../cx";

export type ControlSurface = "inset" | "base" | "surface";

export type ControlSize = "sm" | "md";

const SURFACES: Record<ControlSurface, string> = {
  inset: "bg-bg-inset",
  base: "bg-bg-base",
  surface: "bg-bg-surface",
};

export function controlAppearance(surface: ControlSurface = "inset", invalid = false) {
  return cx(
    "ui-control ui-interactive min-w-0 rounded-md border text-text-primary",
    "focus-visible:outline-2 focus-visible:outline-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    SURFACES[surface],
    invalid
      ? "border-git-deleted focus-visible:outline-git-deleted"
      : "border-[var(--field-border)] hover:not-disabled:border-control-border focus-visible:border-accent focus-visible:outline-accent",
  );
}

export function controlSize(size: ControlSize = "md") {
  return size === "sm" ? "h-[32px] px-2 text-xs" : "h-9 px-3 text-sm";
}
