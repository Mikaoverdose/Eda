import { ButtonBase } from "./ButtonBase";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

export function WindowControlButton({
  close = false,
  children,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; close?: boolean }) {
  return (
    <ButtonBase
      {...props}
      type={type}
      className={cx(
        "flex w-11 items-center justify-center text-text-secondary",
        close
          ? "hover:not-disabled:bg-[#c42b1c] hover:not-disabled:text-white"
          : "hover:not-disabled:bg-bg-raised",
        className,
      )}
    >
      {children}
    </ButtonBase>
  );
}
