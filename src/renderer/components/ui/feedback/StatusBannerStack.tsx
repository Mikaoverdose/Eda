import { t } from "@shared/i18n";
import type { ReactNode } from "react";

export function StatusBannerStack({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label={t("statusBanner.notifications")}
      className="flex shrink-0 flex-col empty:hidden"
    >
      {children}
    </section>
  );
}
