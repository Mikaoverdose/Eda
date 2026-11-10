import type { ReactNode } from "react";
import { cx } from "../cx";
import { FEEDBACK_TONES, type FeedbackTone } from "./feedbackStyles";

export function StateMessage({
  title,
  description,
  tone = "empty",
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  tone?: Exclude<FeedbackTone, "warning">;
  action?: ReactNode;
  className?: string;
}) {
  const { Icon, color } = FEEDBACK_TONES[tone];

  return (
    <div
      className={cx(
        "flex min-w-0 flex-col items-center justify-center gap-3 p-6 text-center",
        className,
      )}
    >
      <div
        role={tone === "error" ? "alert" : "status"}
        className="flex min-w-0 max-w-[52ch] flex-col items-center gap-2"
      >
        <Icon
          aria-hidden="true"
          size={20}
          className={cx(tone === "loading" && "animate-spin-fast", color)}
        />

        <p className="text-sm font-medium text-text-primary [overflow-wrap:anywhere]">{title}</p>

        {description && (
          <div className="text-sm leading-relaxed text-text-secondary [overflow-wrap:anywhere]">
            {description}
          </div>
        )}
      </div>

      {action && <div className="flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
