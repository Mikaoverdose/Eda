import type { DetailsHTMLAttributes, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cx } from "../cx";

export function Disclosure({
  title,
  children,
  className,
  summaryClassName,
  ...props
}: Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "title"> & {
  title: ReactNode;
  children: ReactNode;
  summaryClassName?: string;
}) {
  return (
    <details {...props} className={cx("ui-disclosure text-sm text-text-secondary", className)}>
      <summary
        className={cx(
          "disclosure-summary flex min-h-6 cursor-pointer items-center gap-2 rounded-sm",
          "hover:text-text-primary",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
          summaryClassName,
        )}
      >
        <ChevronRight
          size={14}
          className="disclosure-chevron shrink-0 text-text-tertiary"
          aria-hidden="true"
        />
        <span className="flex min-w-0 flex-1 items-center gap-2">{title}</span>
      </summary>
      {children}
    </details>
  );
}
