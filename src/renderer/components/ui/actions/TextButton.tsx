import { ButtonBase } from "./ButtonBase";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

export function TextButton({
  children,
  className,
  type = "button",
  tone = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: "default" | "accent" | "danger";
}) {
  return (
    <ButtonBase
      {...props}
      type={type}
      className={cx(
        "ui-text-button min-h-6 min-w-6 rounded-sm text-xs underline-offset-2 disabled:cursor-not-allowed disabled:opacity-45",
        tone === "accent"
          ? "text-accent-text"
          : tone === "danger"
            ? "text-git-deleted"
            : "text-text-secondary hover:not-disabled:text-text-primary",
        className,
      )}
    >
      {children}
    </ButtonBase>
  );
}
