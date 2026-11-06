import { t } from "@shared/i18n";
import { CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "../actions/Button";
import { cx } from "../cx";

export function StatusBanner({
  label,
  children,
  action,
  tone = "info",
  title,
  onDismiss,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: "info" | "warning" | "error";
  title?: string;
  onDismiss?: () => void;
}) {
  const Icon = tone === "error" ? CircleAlert : tone === "warning" ? TriangleAlert : Info;

  return (
    <aside
      aria-label={label}
      className={cx(
        "relative flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs",
        tone === "error"
          ? "border-git-deleted/20 bg-git-deleted/5"
          : tone === "warning"
            ? "border-git-modified/20 bg-git-modified/5"
            : "border-border-subtle bg-bg-inset",
      )}
    >
      <Icon
        size={13}
        aria-hidden="true"
        className={cx(
          "shrink-0",
          tone === "error"
            ? "text-git-deleted"
            : tone === "warning"
              ? "text-git-modified"
              : "text-accent-text",
        )}
      />

      <span
        role={tone === "error" ? "alert" : "status"}
        className="min-w-0 flex-1 truncate text-text-secondary"
        title={title}
      >
        {children}
      </span>

      {action}

      {onDismiss && (
        <IconButton
          size="xs"
          variant="quiet"
          aria-label={t("statusBanner.dismiss", { label })}
          title={t("statusBanner.dismiss", { label })}
          icon={<X size={13} aria-hidden="true" />}
          onClick={onDismiss}
        />
      )}
    </aside>
  );
}
