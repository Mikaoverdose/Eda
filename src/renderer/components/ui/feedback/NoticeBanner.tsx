import type { ReactNode } from "react";
import { cx } from "../cx";
import { BANNER_SURFACES, FEEDBACK_TONES, type BannerTone } from "./feedbackStyles";

export function NoticeBanner({
  children,
  tone = "info",
  action,
  className,
}: {
  children: ReactNode;
  tone?: BannerTone;
  action?: ReactNode;
  className?: string;
}) {
  const { Icon, color } = FEEDBACK_TONES[tone];

  return (
    <div
      className={cx(
        "flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-md border px-3 py-3",
        BANNER_SURFACES[tone].notice,
        className,
      )}
    >
      <div
        role={tone === "error" ? "alert" : "status"}
        className="flex min-w-0 flex-1 items-start gap-2 text-xs leading-relaxed text-text-primary"
      >
        <Icon aria-hidden="true" size={16} className={cx("mt-0.5 shrink-0", color)} />
        <div className="min-w-0 [overflow-wrap:anywhere]">{children}</div>
      </div>

      {action && <div className="flex max-w-full flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
