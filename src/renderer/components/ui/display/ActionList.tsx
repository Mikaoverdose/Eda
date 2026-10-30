import type { ReactNode } from "react";

export function ActionList({
  items,
}: {
  items: readonly { id: string; title: ReactNode; description?: ReactNode; actions: ReactNode }[];
}) {
  return (
    <ul className="divide-y divide-border-subtle rounded-md border border-border-default bg-bg-surface">
      {items.map(({ id, title, description, actions }) => (
        <li key={id} className="flex min-w-0 flex-wrap items-center justify-between gap-4 p-4">
          <div className="min-w-0 flex-1 basis-64">
            <div className="text-sm font-medium">{title}</div>
            {description && (
              <div className="mt-1 text-sm text-text-secondary [overflow-wrap:anywhere]">
                {description}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        </li>
      ))}
    </ul>
  );
}
