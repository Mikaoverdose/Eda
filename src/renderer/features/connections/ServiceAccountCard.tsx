import { t } from "@shared/i18n";
import type { ReactNode } from "react";
import { ProviderIcon, type HostingProvider } from "./ProviderIcon";
import { cx } from "../../components/ui/cx";
import { ConnectionCard } from "./ConnectionCard";

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
}: {
  provider: HostingProvider;
  children: ReactNode;
  actions?: ReactNode;
  status?: ReactNode;
  contentClassName?: string;
  compact?: boolean;
  completedLabel?: string | undefined;
  open?: boolean | undefined;
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
      className="flex w-full min-w-0 max-w-sm flex-col gap-3 rounded-md border border-border-subtle bg-bg-surface p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <ProviderIcon provider={provider} />
          {provider}
        </h2>
        {status}
      </div>
      {children && <div className={cx("min-w-0 space-y-2", contentClassName)}>{children}</div>}
      {actions && <div className="flex min-h-8 flex-wrap gap-2">{actions}</div>}
    </section>
  );
}
