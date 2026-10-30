import { cx } from "../../components/ui/cx";

export function CommitMessage({
  children,
  compact = false,
  className,
}: {
  children: string;
  compact?: boolean;
  className?: string;
}) {
  const type = /^[^a-zA-Z]*([a-zA-Z]+)(?:\([^)]*\))?!?:/.exec(children)?.[1]?.toLowerCase();

  return (
    <code
      data-commit-type={type}
      className={cx(
        "commit-message block rounded-md border border-border-subtle px-3 py-2 font-mono leading-relaxed text-text-primary",
        compact ? "text-[10px]" : "text-xs",
        className,
      )}
    >
      {children}
    </code>
  );
}
