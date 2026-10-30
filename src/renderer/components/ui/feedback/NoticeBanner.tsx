import type { ReactNode } from "react";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { cx } from "../cx";

export function NoticeBanner({
  children,
  tone = "info",
  action,
  className,
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "error";
  action?: ReactNode;
  className?: string;
}) {
  const Icon = tone === "error" ? CircleAlert : tone === "warning" ? TriangleAlert : Info;

  return (
    <div
      className={cx(
        "flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-md border px-3 py-3",
        tone === "error"
          ? "border-git-deleted/20 bg-git-deleted/5"
          : tone === "warning"
            ? "border-git-modified/35 bg-git-modified/10"
            : "border-accent-border bg-accent-muted",
        className,
      )}
    >
      <div
        role={tone === "error" ? "alert" : "status"}
        className="flex min-w-0 flex-1 items-start gap-2 text-xs leading-relaxed text-text-primary"
      >
        <Icon
          aria-hidden="true"
          size={16}
          className={cx(
            "mt-0.5 shrink-0",
            tone === "error"
              ? "text-git-deleted"
              : tone === "warning"
                ? "text-git-modified"
                : "text-accent-text",
          )}
        />
        <div className="min-w-0 [overflow-wrap:anywhere]">{children}</div>
      </div>
      {action && <div className="flex max-w-full flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
