import type { InputHTMLAttributes } from "react";
import { cx } from "../cx";

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function Radio({ className, ...props }: RadioProps) {
  return <input {...props} type="radio" className={cx("radio-control", className)} />;
}
