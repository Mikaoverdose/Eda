import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

export type CheckboxControlProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function CheckboxControl({ className, ...props }: CheckboxControlProps) {
  return (
    <input {...props} type="checkbox" className={cx("checkbox-control shrink-0", className)} />
  );
}

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "children"
> {
  children: ReactNode;
}

export function Checkbox({ children, className, ...props }: CheckboxProps) {
  return (
    <label
      className={cx(
        "ui-checkbox inline-flex min-h-6 cursor-pointer items-center gap-2 text-sm has-[:disabled]:cursor-not-allowed",
        className,
      )}
    >
      <CheckboxControl {...props} />
      {children}
    </label>
  );
}
