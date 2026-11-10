import type { ButtonHTMLAttributes, ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "../cx";
import { ButtonBase } from "./ButtonBase";

export function ListItemButton({
  children,
  selected = false,
  variant = "list",
  className,
  type = "button",
  ...props
}: ComponentPropsWithRef<"button"> & {
  children: ReactNode;
  selected?: boolean;
  variant?: "list" | "menu";
}) {
  return (
    <ButtonBase
      {...props}
      type={type}
      className={cx(
        "flex min-w-0 w-full items-center gap-2 rounded-sm px-2 text-left text-sm",
        variant === "menu" ? "min-h-[32px] py-1 focus-visible:bg-bg-raised" : "py-1.5",
        "disabled:cursor-not-allowed disabled:opacity-45",
        selected
          ? "bg-accent-muted text-accent-text"
          : variant === "menu"
            ? "text-text-secondary hover:not-disabled:bg-accent-muted hover:not-disabled:text-text-primary"
            : "text-text-secondary hover:not-disabled:bg-bg-raised hover:not-disabled:text-text-primary",
        className,
      )}
    >
      {children}
    </ButtonBase>
  );
}

export function MenuItem(props: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return <ListItemButton {...props} role="menuitem" variant="menu" />;
}
