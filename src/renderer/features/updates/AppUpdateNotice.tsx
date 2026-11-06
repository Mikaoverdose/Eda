import { t } from "@shared/i18n";
import { Button, StatusBanner, useNoticeDismissal } from "../../components/ui/index";
import { useUpdates } from "./hooks/useUpdates";
import { openSettings } from "../../commands/open-settings";

export function AppUpdateNotice({ aboutOpen }: { aboutOpen: boolean }) {
  const { state, preview } = useUpdates();
  const noticeId =
    state && ["available", "ready"].includes(state.phase)
      ? JSON.stringify([
          preview,
          state.release?.version ?? state.release?.name,
          state.phase,
          state.capability,
          state.reason,
        ])
      : null;
  const { dismissed, dismiss } = useNoticeDismissal(noticeId);

  if (aboutOpen || dismissed || !state || noticeId === null) return null;

  const release = state.release;
  const name = release?.version
    ? t("appUpdateNotice.releaseVersion", { version: release.version })
    : (release?.name ?? t("appUpdateNotice.anUpdate"));
  const heading = t("appUpdateNotice.isAvailable", { value1: name });

  return (
    <StatusBanner
      label={t("appUpdateNotice.updateNotification")}
      title={heading}
      onDismiss={dismiss}
      action={
        <Button size="sm" variant="quiet" onClick={() => openSettings("about")}>
          {t("appUpdateNotice.viewUpdate")}
        </Button>
      }
    >
      <span className="font-medium text-text-primary">{heading}</span>
    </StatusBanner>
  );
}
