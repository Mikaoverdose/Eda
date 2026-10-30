import { t } from "@shared/i18n";
import { Button, NoticeBanner } from "../../components/ui/index";
import { useUpdates } from "./hooks/useUpdates";
import { openSettings } from "../../commands/open-settings";

export function AppUpdateNotice({ aboutOpen }: { aboutOpen: boolean }) {
  const { state } = useUpdates();
  if (aboutOpen || !state || !["available", "ready"].includes(state.phase)) return null;
  return (
    <div className="shrink-0 px-3 pt-3">
      <NoticeBanner
        action={
          <Button size="sm" onClick={() => openSettings("about")}>
            {state.phase === "ready"
              ? t("appUpdateNotice.reviewAndRestart")
              : t("appUpdateNotice.viewUpdate")}
          </Button>
        }
      >
        {state.phase === "ready"
          ? t("appUpdateNotice.isReadyToInstall", {
              value1: state.release?.name ?? t("appUpdateNotice.anUpdate"),
            })
          : t("appUpdateNotice.isAvailable", {
              value1: state.release?.name ?? t("appUpdateNotice.anUpdate"),
            })}
      </NoticeBanner>
    </div>
  );
}
