import type { ReactNode } from "react";
import { PanelControls, type PanelControlsProps } from "./PanelControls";

export function PanelHeader({
  title,
  label,
  leading,
  children,
  controls,
}: {
  title: ReactNode;
  label?: string;
  leading?: ReactNode;
  children?: ReactNode;
  controls: PanelControlsProps;
}) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      {leading}
      <h3 aria-label={label} className="min-w-0 truncate text-sm font-semibold text-text-secondary">
        {title}
      </h3>
      {children ?? <span className="ml-auto" />}
      <PanelControls {...controls} />
    </header>
  );
}
