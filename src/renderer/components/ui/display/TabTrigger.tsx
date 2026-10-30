import { ButtonBase } from "../actions/ButtonBase";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "../cx";

export function TabTrigger({
  selected,
  indicator = true,
  children,
  className,
  type = "button",
  ...props
}: ComponentPropsWithRef<"button"> & {
  selected: boolean;
  indicator?: boolean;
  children: ReactNode;
}) {
  return (
    <ButtonBase
      {...props}
      type={type}
      role="tab"
      aria-selected={selected}
      className={cx(
        "ui-tab relative flex min-w-0 items-center gap-2 rounded-sm border-b-2 border-transparent px-2 py-1.5 text-left text-xs font-medium",
        "hover:not-disabled:bg-bg-raised",
        selected ? "text-text-primary" : "text-text-secondary",
        className,
      )}
    >
      {indicator && <span aria-hidden="true" className="ui-tab-indicator" />}
      {children}
    </ButtonBase>
  );
}
