import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, SearchX } from "lucide-react";
import { cx } from "../cx";

const ICONS = {
  empty: SearchX,
  loading: LoaderCircle,
  error: CircleAlert,
  success: CircleCheck,
  info: Info,
};

export function StateMessage({
  title,
  description,
  tone = "empty",
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  tone?: keyof typeof ICONS;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = ICONS[tone];

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
          className={cx(
            tone === "loading" && "animate-spin-fast",
            tone === "error"
              ? "text-git-deleted"
              : tone === "success"
                ? "text-git-added"
                : "text-text-tertiary",
          )}
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
