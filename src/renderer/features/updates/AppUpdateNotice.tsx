import { t } from "@shared/i18n";
import { Button, StatusBanner, useNoticeDismissal } from "../../components/ui/index";
import { useUpdates } from "./hooks/useUpdates";
import { openSettings } from "../../commands/open-settings";

export function AppUpdateNotice({ aboutOpen }: { aboutOpen: boolean }) {
  const { state, preview } = useUpdates();
  const noticeId =
    state && ["available", "ready"].includes(state.phase)
      ? JSON.stringify([preview, state.release?.version ?? state.release?.name, state.phase])
      : null;
  const { dismissed, dismiss } = useNoticeDismissal(noticeId);

  if (aboutOpen || dismissed || !state || noticeId === null) return null;

  const release = state.release;
  const name = release?.version
    ? t("appUpdateNotice.releaseVersion", { version: release.version })
    : (release?.name ?? t("appUpdateNotice.anUpdate"));
  const heading =
    state.phase === "ready"
      ? t("appUpdateNotice.isReadyToInstall", { value1: name })
      : t("appUpdateNotice.isAvailable", { value1: name });
  const installed = t("appUpdateNotice.installedVersion", {
    version: window.eda.app.version.displayVersion,
  });
  const detail = state.phase === "ready" ? t("appUpdateNotice.downloadedAndVerified") : null;

  return (
    <StatusBanner
      label={t("appUpdateNotice.updateNotification")}
      title={[heading, `${installed}.`, detail].filter(Boolean).join(" ")}
      onDismiss={dismiss}
      action={
        <Button size="sm" variant="quiet" onClick={() => openSettings("about")}>
          {state.phase === "ready"
            ? t("appUpdateNotice.reviewAndRestart")
            : t("appUpdateNotice.viewUpdate")}
        </Button>
      }
    >
      <span className="font-medium text-text-primary">{heading}</span>

      <span className="mx-2 text-text-tertiary" aria-hidden="true">
        ·
      </span>

      <span>{installed}</span>

      {detail && (
        <span className="hidden md:inline">
          <span className="mx-2 text-text-tertiary" aria-hidden="true">
            ·
          </span>

          {detail}
        </span>
      )}
    </StatusBanner>
  );
}
