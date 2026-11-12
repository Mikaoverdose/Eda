import { ButtonBase } from "./ButtonBase";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

const TONES = {
  default: "text-text-secondary hover:not-disabled:text-text-primary",
  accent: "text-accent-text",
  danger: "text-git-deleted",
  warning: "text-git-modified",
};

export function TextButton({
  children,
  className,
  type = "button",
  tone = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <ButtonBase
      {...props}
      type={type}
      className={cx(
        "ui-text-button min-h-6 min-w-6 rounded-sm text-xs underline-offset-2 disabled:cursor-not-allowed disabled:opacity-45",
        TONES[tone],
        className,
      )}
    >
      {children}
    </ButtonBase>
  );
}
