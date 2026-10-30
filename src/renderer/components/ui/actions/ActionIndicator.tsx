import type { ReactNode } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { cx } from "../cx";

export function ActionIndicator({
  state,
  idleIcon,
}: {
  state: "idle" | "pending" | "success" | "error";
  idleIcon?: ReactNode;
}) {
  return (
    <span className="relative block size-4" aria-hidden="true">
      <span className={cx("ui-action-glyph", state === "idle" && "ui-action-visible")}>
        {idleIcon}
      </span>
      <span className={cx("ui-action-glyph", state === "pending" && "ui-action-visible")}>
        <LoaderCircle size={16} className={state === "pending" ? "animate-spin-fast" : undefined} />
      </span>
      <span
        className={cx("ui-action-glyph text-git-added", state === "success" && "ui-action-visible")}
      >
        <Check size={16} />
      </span>
      <span
        className={cx("ui-action-glyph text-git-deleted", state === "error" && "ui-action-visible")}
      >
        <X size={16} />
      </span>
    </span>
  );
}
