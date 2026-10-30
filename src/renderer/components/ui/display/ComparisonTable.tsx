import { t } from "@shared/i18n";
import type { ReactNode } from "react";

export interface ComparisonTableProps {
  label: string;
  fieldLabel?: string;
  beforeLabel: string;
  afterLabel: string;
  rows: readonly { id: string; label: ReactNode; before: ReactNode; after: ReactNode }[];
}

export function ComparisonTable({
  label,
  fieldLabel = t("comparisonTable.field"),
  beforeLabel,
  afterLabel,
  rows,
}: ComparisonTableProps) {
  return (
    <div className="overflow-hidden rounded-md border border-border-subtle">
      <table aria-label={label} className="w-full table-fixed border-collapse text-left text-xs">
        <thead className="bg-bg-surface text-text-secondary">
          <tr>
            <th scope="col" className="w-1/4 px-3 py-2 font-medium">
              {fieldLabel}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {beforeLabel}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {afterLabel}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <tr key={row.id} className="align-top">
              <th scope="row" className="px-3 py-3 font-medium [overflow-wrap:anywhere]">
                {row.label}
              </th>
              <td className="px-3 py-3 text-text-secondary [overflow-wrap:anywhere]">
                {row.before}
              </td>
              <td className="bg-accent-muted/30 px-3 py-3 text-text-primary [overflow-wrap:anywhere]">
                {row.after}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
