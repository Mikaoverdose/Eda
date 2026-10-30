import type { HTMLAttributes } from "react";
import { cx } from "../cx";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cx("ui-skeleton h-3 rounded bg-border-subtle", className)}
    />
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-4 overflow-hidden p-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-3 shrink-0 rounded-full" />
          <Skeleton className={index % 3 === 0 ? "w-2/3" : index % 3 === 1 ? "w-1/2" : "w-4/5"} />
        </div>
      ))}
    </div>
  );
}

export function LoadingContent({ label, rows = 8 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="min-h-0 flex-1 overflow-hidden">
      <SkeletonRows rows={rows} />
    </div>
  );
}
