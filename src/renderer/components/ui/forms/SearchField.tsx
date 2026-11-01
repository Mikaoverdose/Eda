import type { ComponentPropsWithRef } from "react";
import { Search } from "lucide-react";
import { cx } from "../cx";
import type { ControlSize } from "./controlStyles";

export interface SearchFieldProps extends Omit<ComponentPropsWithRef<"input">, "type" | "size"> {
  "aria-label": string;
  size?: ControlSize;
  className?: string;
}

export function SearchField({ size = "sm", className, ...props }: SearchFieldProps) {
  return (
    <label
      className={cx(
        "ui-search ui-control flex min-w-0 items-center gap-2 rounded-md border border-[var(--field-border)] bg-bg-inset px-2 text-text-tertiary",
        "ui-interactive hover:border-control-border focus-within:border-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
        props.disabled && "pointer-events-none opacity-50",
        size === "sm" ? "h-[32px]" : "h-9",
        className,
      )}
    >
      <Search size={14} aria-hidden="true" className="shrink-0" />
      <input
        {...props}
        type="search"
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary focus-visible:outline-none"
      />
    </label>
  );
}
