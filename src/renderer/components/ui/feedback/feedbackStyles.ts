import { CircleAlert, CircleCheck, Info, LoaderCircle, SearchX, TriangleAlert } from "lucide-react";

export const FEEDBACK_TONES = {
  info: { Icon: Info, color: "text-accent-text" },
  warning: { Icon: TriangleAlert, color: "text-git-modified" },
  error: { Icon: CircleAlert, color: "text-git-deleted" },
  success: { Icon: CircleCheck, color: "text-git-added" },
  empty: { Icon: SearchX, color: "text-text-tertiary" },
  loading: { Icon: LoaderCircle, color: "text-text-tertiary" },
} as const;

export type FeedbackTone = keyof typeof FEEDBACK_TONES;
export type BannerTone = "info" | "warning" | "error";

export const BANNER_SURFACES = {
  info: {
    notice: "border-accent-border bg-accent-muted",
    status: "border-border-subtle bg-bg-inset",
  },
  warning: {
    notice: "border-git-modified/35 bg-git-modified/10",
    status: "border-git-modified/20 bg-git-modified/5",
  },
  error: {
    notice: "border-git-deleted/20 bg-git-deleted/5",
    status: "border-git-deleted/20 bg-git-deleted/5",
  },
} satisfies Record<BannerTone, { notice: string; status: string }>;
