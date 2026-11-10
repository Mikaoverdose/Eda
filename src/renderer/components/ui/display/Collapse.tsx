import type { ComponentPropsWithRef } from "react";
import { cx } from "../cx";

export function Collapse({
  open,
  children,
  className,
  ...props
}: Omit<ComponentPropsWithRef<"div">, "inert" | "aria-hidden"> & { open: boolean }) {
  return (
    <div
      {...props}
      className={cx("ui-collapse flow-root min-w-0", className)}
      data-open={open}
      inert={!open}
      aria-hidden={!open}
    >
      {children}
    </div>
  );
}
