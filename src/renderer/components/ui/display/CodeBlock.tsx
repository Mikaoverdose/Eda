import type { ReactNode } from "react";
import { cx } from "../cx";

export function CodeBlock({
  label,
  children,
  wrap = false,
  className,
}: {
  label: string;
  children: ReactNode;
  wrap?: boolean;
  className?: string;
}) {
  return (
    <pre
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cx(
        "ui-code-block app-surface-code selectable min-w-0 overflow-auto rounded-md border border-border-subtle bg-bg-inset p-3 font-mono text-xs leading-relaxed",
        wrap ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "whitespace-pre",
        className,
      )}
    >
      <code>{children}</code>
    </pre>
  );
}
