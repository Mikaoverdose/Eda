import { t } from "@shared/i18n";
import type { ReactNode } from "react";
import { ProviderIcon, type HostingProvider } from "./ProviderIcon";
import { cx } from "../../components/ui/cx";
import { ConnectionCard } from "./ConnectionCard";
import { AnimatedSize } from "../../components/ui/index";

export function ServiceAccountCard({
  provider,
  children,
  actions,
  status,
  contentClassName,
  compact = false,
  completedLabel,
  onOpenChange,
  open,
  summary,
  bodyOpen = true,
  bodySeparator = true,
}: {
  provider: HostingProvider;
  children: ReactNode;
  actions?: ReactNode;
  status?: ReactNode;
  contentClassName?: string;
  compact?: boolean;
  completedLabel?: string | undefined;
  open?: boolean | undefined;
  summary?: ReactNode;
  bodyOpen?: boolean;
  bodySeparator?: boolean;
  onOpenChange?: ((open: boolean) => void) | undefined;
}) {
  if (compact)
    return (
      <ConnectionCard
        title={provider}
        icon={<ProviderIcon provider={provider} />}
        completedLabel={completedLabel}
        status={status}
        onOpenChange={onOpenChange}
        open={open}
      >
        {children}
        {actions && <footer className="flex flex-wrap items-center gap-2 pt-1">{actions}</footer>}
      </ConnectionCard>
    );

  return (
    <section
      aria-label={t("settings.serviceAccountCard.connection", { provider: provider })}
      className="min-w-0 rounded-lg border border-border-subtle bg-bg-surface"
    >
      <AnimatedSize>
        <div className="flex min-h-12 flex-wrap items-center gap-2 px-3 py-2">
          <h2 className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-sm font-medium">
            <ProviderIcon provider={provider} />
            {provider}
          </h2>

          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
            {status}
            {actions}
          </div>
        </div>

        {summary && <div className="min-w-0 px-3 pb-3 text-xs text-text-tertiary">{summary}</div>}

        {bodyOpen && children && (
          <div
            className={cx(
              "min-w-0 space-y-3 px-3 pb-3",
              bodySeparator && "border-t border-border-subtle pt-3",
              contentClassName,
            )}
          >
            {children}
          </div>
        )}
      </AnimatedSize>
    </section>
  );
}
