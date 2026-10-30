import type { ReactNode } from "react";
import { cx } from "../cx";

export function RadioCard({
  name,
  value,
  checked,
  onChange,
  children,
  className,
  disabled = false,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cx(
        "group relative flex min-w-0 cursor-pointer items-center gap-3 rounded-md border px-3 py-3 text-left",
        "ui-radio-card ui-interactive has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-text",
        checked
          ? "border-accent-border bg-accent-muted shadow-[inset_0_0_0_1px_var(--accent-border)]"
          : "border-border-default hover:has-[input:enabled]:border-border-strong hover:has-[input:enabled]:bg-bg-inset",
        className,
      )}
    >
      <input
        type="radio"
        className="absolute inset-0 z-[1] m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || !["Home", "End"].includes(event.key)) return;

          const group = event.currentTarget.closest('[role="radiogroup"]');
          const options = Array.from(
            group?.querySelectorAll<HTMLInputElement>('input[type="radio"]:not(:disabled)') ?? [],
          ).filter((input) => input.name === name);
          const target = event.key === "Home" ? options[0] : options.at(-1);

          if (!target) return;

          event.preventDefault();
          target.focus();
          target.click();
        }}
      />
      {children}
    </label>
  );
}
