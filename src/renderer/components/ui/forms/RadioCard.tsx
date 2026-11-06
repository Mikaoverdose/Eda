import type { ReactNode } from "react";
import { cx } from "../cx";

export function RadioCard({
  name,
  value,
  checked,
  onChange,
  children,
  actions,
  className,
  disabled = false,
  variant = "card",
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  disabled?: boolean;
  variant?: "card" | "row";
}) {
  const Container = actions ? "div" : "label";
  const control = (
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
  );

  return (
    <Container
      className={cx(
        "group relative flex min-w-0 cursor-pointer items-center gap-3 px-3 text-left",
        "ui-radio-card ui-interactive has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-text",
        variant === "row"
          ? "py-2.5 has-[:focus-visible]:-outline-offset-2"
          : "rounded-md border py-3 has-[:focus-visible]:outline-offset-2",
        checked
          ? cx(
              "bg-accent-muted",
              variant === "card" &&
                "border-accent-border shadow-[inset_0_0_0_1px_var(--accent-border)]",
            )
          : cx(
              "hover:has-[input:enabled]:bg-bg-inset",
              variant === "card" &&
                "border-border-default hover:has-[input:enabled]:border-border-strong",
            ),
        className,
      )}
    >
      {actions ? (
        <>
          <label className="relative flex min-w-0 flex-1 cursor-pointer items-center gap-3 self-stretch has-[:disabled]:cursor-not-allowed">
            {control}
            {children}
          </label>
          {actions}
        </>
      ) : (
        <>
          {control}
          {children}
        </>
      )}
    </Container>
  );
}
