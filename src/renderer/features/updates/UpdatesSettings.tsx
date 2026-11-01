import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { UPDATE_DOWNLOAD_PAGE, type UpdateState } from "@shared/updates";
import { Download, RotateCw } from "lucide-react";
import { useState } from "react";
import {
  AsyncButton,
  Button,
  Checkbox,
  Disclosure,
  ExternalLinkButton,
  NoticeBanner,
} from "../../components/ui/index";
import { useSessionStore } from "../../stores/session-store";
import { formatDateTime } from "../../utils/format";
import { useScopedSetting } from "../settings/hooks/useScopedSetting";
import { useUpdates } from "./hooks/useUpdates";

export interface UpdateActions {
  check: () => Promise<boolean>;
  download: () => Promise<boolean>;
  install: () => Promise<boolean>;
}

export function UpdateStatus({ state, actions }: { state: UpdateState; actions: UpdateActions }) {
  const busy = ["checking", "downloading", "installing"].includes(state.phase);
  const release = state.release;
  return (
    <div className="space-y-3">
      <p role="status" className="text-sm text-text-secondary [overflow-wrap:anywhere]">
        {state.capability !== "automatic"
          ? state.reason
          : state.phase === "checking"
            ? t("settings.updatesSettings.checkingForUpdates")
            : state.phase === "current"
              ? (state.reason ?? t("settings.updatesSettings.youReUpToDate"))
              : state.phase === "available"
                ? t("settings.updatesSettings.isAvailable", {
                    value1: release?.name ?? t("settings.updatesSettings.anUpdate"),
                  })
                : state.phase === "downloading"
                  ? t("settings.updatesSettings.downloadingAndVerifyingTheUpdate")
                  : state.phase === "ready"
                    ? t("settings.updatesSettings.isReadyToInstall", {
                        value1: release?.name ?? t("settings.updatesSettings.theUpdate"),
                      })
                    : state.phase === "installing"
                      ? t("settings.updatesSettings.savingYourWorkspaceAndRestartingEda")
                      : state.phase === "error"
                        ? t("settings.updatesSettings.updateCheckFailed")
                        : t("settings.updatesSettings.checkForANewVersionOfEda")}
      </p>
      {state.phase === "downloading" && (
        <div className="space-y-1.5">
          <progress
            className="h-1.5 w-full accent-accent-text"
            aria-label={t("settings.updatesSettings.updateDownload")}
            max={100}
            {...(state.progress ? { value: state.progress.percent } : {})}
          />
          <p className="text-xs text-text-tertiary">
            {state.progress
              ? t("settings.updatesSettings.percentDownloaded", {
                  percent: Math.floor(state.progress.percent),
                })
              : t("settings.updatesSettings.preparingDownload")}
          </p>
        </div>
      )}
      {state.error && <NoticeBanner tone="error">{state.error}</NoticeBanner>}
      {release?.notes && (
        <Disclosure title={t("settings.updatesSettings.whatSNew")}>
          <p className="selectable whitespace-pre-wrap text-sm leading-relaxed text-text-secondary [overflow-wrap:anywhere]">
            {release.notes}
          </p>
        </Disclosure>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {state.capability === "automatic" &&
          !["available", "downloading", "ready", "installing"].includes(state.phase) && (
            <AsyncButton
              label={t("settings.updatesSettings.checkForUpdates")}
              onAction={actions.check}
              icon={<RotateCw size={14} />}
              disabled={busy}
            >
              {t("settings.updatesSettings.checkForUpdates")}
            </AsyncButton>
          )}
        {state.phase === "available" && (
          <AsyncButton
            label={t("settings.updatesSettings.downloadUpdate")}
            onAction={actions.download}
            icon={<Download size={14} />}
            variant="primary"
          >
            {t("settings.updatesSettings.downloadUpdate")}
          </AsyncButton>
        )}
        {state.phase === "ready" && (
          <AsyncButton
            label={t("settings.updatesSettings.restartAndInstall")}
            onAction={actions.install}
            variant="primary"
            icon={<RotateCw size={14} />}
          >
            {t("settings.updatesSettings.restartAndInstall")}
          </AsyncButton>
        )}
        {state.phase === "installing" && (
          <Button busy>{t("settings.updatesSettings.restartingEda")}</Button>
        )}
        <ExternalLinkButton href={UPDATE_DOWNLOAD_PAGE}>
          {t("settings.updatesSettings.downloadPage")}
        </ExternalLinkButton>
      </div>
      {state.checkedAt && (
        <p className="text-xs text-text-tertiary">
          {t("settings.updatesSettings.lastChecked", { value1: formatDateTime(state.checkedAt) })}
        </p>
      )}
    </div>
  );
}

export function UpdatesSettings() {
  const { state, error } = useUpdates();
  const automatic = useScopedSetting("automaticUpdateChecks", "application");
  const [actionError, setActionError] = useState<string | null>(null);
  const run = async (action: keyof UpdateActions) => {
    setActionError(null);
    try {
      if (action === "install" && !(await useSessionStore.getState().flush())) {
        setActionError(
          t("settings.updatesSettings.saveYourWorkspaceSuccessfullyBeforeRestartingYourInput"),
        );
        return false;
      }
      const result = await window.eda.updates[action]();
      if (!result.ok) {
        setActionError(errorMessage(result.error));
        return false;
      }
      return !result.value.error;
    } catch {
      setActionError(t("settings.updatesSettings.theUpdateActionCouldNotFinishTryAgain"));
      return false;
    }
  };
  return (
    <section
      aria-labelledby="about-updates-heading"
      className="space-y-4 border-t border-border-subtle pt-6"
    >
      <h2 id="about-updates-heading" className="text-sm font-medium">
        {t("settings.updatesSettings.updates")}
      </h2>
      {state ? (
        <UpdateStatus
          state={state}
          actions={{
            check: () => run("check"),
            download: () => run("download"),
            install: () => run("install"),
          }}
        />
      ) : (
        <p className="text-sm text-text-tertiary">
          {t("settings.updatesSettings.readingUpdateStatus")}
        </p>
      )}
      {(error || actionError) && <NoticeBanner tone="error">{error || actionError}</NoticeBanner>}
      <Checkbox
        checked={automatic.resolved.value}
        disabled={automatic.reading}
        onChange={(event) => void automatic.set(event.currentTarget.checked)}
      >
        {t("settings.updatesSettings.checkForUpdatesAutomatically")}
      </Checkbox>
      <p className="text-xs text-text-tertiary">
        {t("settings.updatesSettings.installedBuildsCheckAfterStartupAndEverySix")}
      </p>
    </section>
  );
}
