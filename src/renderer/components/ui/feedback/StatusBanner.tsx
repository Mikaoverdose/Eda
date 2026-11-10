import { t } from "@shared/i18n";
import { CloseIcon as X } from "../icons";
import type { ReactNode } from "react";
import { IconButton } from "../actions/Button";
import { cx } from "../cx";
import { AnimatedSize } from "../display/AnimatedSize";
import { BANNER_SURFACES, FEEDBACK_TONES, type BannerTone } from "./feedbackStyles";

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
  tone?: BannerTone;
  title?: string;
  onDismiss?: () => void;
}) {
  const { Icon, color } = FEEDBACK_TONES[tone];

  return (
    <aside
      aria-label={label}
      className={cx(
        "relative flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs",
        BANNER_SURFACES[tone].status,
      )}
    >
      <Icon size={13} aria-hidden="true" className={cx("shrink-0", color)} />

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

export function StatusBannerStack({ children }: { children: ReactNode }) {
  return (
    <section aria-label={t("statusBanner.notifications")} className="shrink-0">
      <AnimatedSize contentClassName="flex flex-col">{children}</AnimatedSize>
    </section>
  );
}
