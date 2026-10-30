import type { ReactNode } from "react";

export function DefinitionList({
  items,
}: {
  items: readonly { label: string; value: ReactNode; description?: ReactNode }[];
}) {
  return (
    <dl className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-bg-surface px-3">
      {items.map(({ label, value, description }) => (
        <div
          key={label}
          className="grid min-w-0 gap-1 py-3 sm:grid-cols-[minmax(8rem,1fr)_minmax(0,2fr)] sm:gap-x-4"
        >
          <dt className="text-xs text-text-secondary">{label}</dt>
          <dd className="min-w-0 text-sm text-text-primary [overflow-wrap:anywhere]">
            {value}
            {description && (
              <div className="mt-1 text-xs leading-relaxed text-text-tertiary">{description}</div>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
