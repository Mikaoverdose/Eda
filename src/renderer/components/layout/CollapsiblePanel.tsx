import { useLayoutEffect, useRef, type ReactNode } from "react";
import { CollapsedRail } from "./CollapsedRail";

export function CollapsiblePanel({
  collapsed,
  name,
  horizontal = false,
  onExpand,
  children,
  badge,
}: {
  collapsed: boolean;
  name: string;
  horizontal?: boolean;
  onExpand: () => void;
  children: ReactNode;
  badge?: string | undefined;
}) {
  const root = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);

  useLayoutEffect(() => {
    if (!restoreFocus.current) return;

    const targets = root.current?.querySelectorAll<HTMLElement>(
      collapsed ? ":scope > .panel-rail button" : ":scope > .panel-content button",
    );
    const available = Array.from(targets ?? []).filter((element) => !element.closest("[inert]"));

    (
      available.find((element) => element.hasAttribute("data-panel-collapse")) ?? available[0]
    )?.focus();
    restoreFocus.current = false;
  }, [collapsed]);

  return (
    <div
      ref={root}
      data-layout-region=""
      className="collapsible-panel relative h-full min-h-0 w-full min-w-0 overflow-hidden"
      data-collapsed={collapsed}
      onFocusCapture={() => {
        restoreFocus.current = true;
      }}
      onBlurCapture={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))
          restoreFocus.current = false;
      }}
    >
      <div className="panel-rail absolute inset-0" inert={!collapsed} aria-hidden={!collapsed}>
        <CollapsedRail
          name={name}
          side="left"
          horizontal={horizontal}
          onExpand={onExpand}
          badge={badge}
        />
      </div>
      <div
        className="panel-content h-full min-h-0 w-full min-w-0"
        inert={collapsed}
        aria-hidden={collapsed}
      >
        {children}
      </div>
    </div>
  );
}
