import type { ReactNode } from "react";

export function SectionLabel({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {children}
      </h2>
      {trailing}
    </div>
  );
}
