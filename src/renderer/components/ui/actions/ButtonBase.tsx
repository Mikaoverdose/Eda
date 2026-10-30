import type { ComponentPropsWithRef } from "react";
import { cx } from "../cx";

export function ButtonBase({
  type = "button",
  className,
  ...props
}: ComponentPropsWithRef<"button">) {
  return (
    <button
      {...props}
      type={type}
      className={cx(
        "ui-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
        className,
      )}
    />
  );
}
