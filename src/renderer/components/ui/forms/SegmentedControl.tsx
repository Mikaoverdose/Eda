import { ButtonBase } from "../actions/ButtonBase";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "../cx";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      style={
        {
          gridTemplateColumns: `repeat(${Math.max(options.length, 1)}, minmax(0, 1fr))`,
          "--segment-count": Math.max(options.length, 1),
          "--segment-index": Math.max(
            0,
            options.findIndex((option) => option.value === value),
          ),
        } as CSSProperties
      }
      className={cx(
        "ui-segments relative isolate inline-grid min-h-[32px] items-center rounded-md border border-border-default bg-bg-inset p-0.5",
        className,
      )}
    >
      {options.some((option) => option.value === value) && (
        <span aria-hidden="true" className="ui-segment-indicator" />
      )}
      {options.map((option) => (
        <ButtonBase
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            "relative min-h-7 rounded-sm px-2.5 py-1 text-xs font-medium",
            value === option.value
              ? "text-text-primary"
              : "text-text-secondary hover:text-text-primary",
          )}
        >
          {option.label}
        </ButtonBase>
      ))}
    </div>
  );
}
