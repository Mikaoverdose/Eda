import { useState, type CSSProperties, type InputHTMLAttributes } from "react";
import { cx } from "../cx";

export function Slider({
  className,
  style,
  value,
  defaultValue = 50,
  min = 0,
  max = 100,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [current, setCurrent] = useState(defaultValue);
  const lower = Number(min);
  const upper = Number(max);
  const progress =
    upper > lower
      ? Math.min(100, Math.max(0, ((Number(value ?? current) - lower) / (upper - lower)) * 100))
      : 0;

  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      onChange={(event) => {
        setCurrent(event.target.value);
        onChange?.(event);
      }}
      style={{ "--slider-progress": `${progress}%`, ...style } as CSSProperties}
      className={cx("slider-control min-w-0", className)}
    />
  );
}
