import { errorMessage } from "@shared/errors";
import { PACKAGE_MANAGER_NAMES } from "@shared/application";
import { t } from "@shared/i18n";
import type { UpdatePhase, UpdateState } from "@shared/updates";
import {
  CircleAlertIcon as CircleAlert,
  CircleCheckIcon as CircleCheck,
  DownloadIcon as Download,
  InfoIcon as Info,
  RotateCwIcon as RotateCw,
} from "../../components/ui/icons";
import { useId, useState } from "react";
import { AsyncButton, Button, Checkbox, Disclosure, NoticeBanner } from "../../components/ui/index";
import { useSessionStore } from "../../stores/session-store";
import { useSimulationStore } from "../../stores/simulation-store";
import { formatDateTime } from "../../utils/format";
import { useScopedSetting } from "../settings/hooks/useScopedSetting";
import { useUpdates } from "./hooks/useUpdates";

export interface UpdateActions {
  check: () => Promise<boolean>;
  download: () => Promise<boolean>;
  install: () => Promise<boolean>;
}

function statusText(state: UpdateState, phase: UpdatePhase): string {
  if (state.capability === "development") return t("settings.updatesSettings.developmentBuild");
  if (state.capability === "manual") return t("settings.updatesSettings.manualUpdates");

  switch (phase) {
    case "checking":
      return t("settings.updatesSettings.checkingForUpdates");
    case "current":
      return (
        (state.capability !== "managed" && state.reason) ||
        t("settings.updatesSettings.youReUpToDate")
      );
    case "available":
      return t("settings.updatesSettings.isAvailable", {
        value1: state.release?.name ?? t("settings.updatesSettings.anUpdate"),
      });
    case "downloading":
      return t("settings.updatesSettings.downloadingAndVerifyingTheUpdate");
    case "ready":
      return t("settings.updatesSettings.isReadyToInstall", {
        value1: state.release?.name ?? t("settings.updatesSettings.theUpdate"),
      });
    case "installing":
      return t(
        state.capability === "homebrew"
          ? "settings.updatesSettings.updatingWithHomebrew"
          : "settings.updatesSettings.savingYourWorkspaceAndRestartingEda",
      );
    case "error":
      return t("settings.updatesSettings.updateCheckFailed");
    default:
      return t("settings.updatesSettings.checkForANewVersionOfEda");
  }
}

function UpdateAction({
  state,
  phase,
  actions,
}: {
  state: UpdateState;
  phase: UpdatePhase;
  actions: UpdateActions;
}) {
  const homebrew = state.capability === "homebrew";

  if (state.capability === "automatic" || homebrew) {
    if (phase === "installing")
      return (
        <Button size="sm" busy>
          {t(
            homebrew
              ? "settings.updatesSettings.homebrewUpdateInProgress"
              : "settings.updatesSettings.restartingEda",
          )}
        </Button>
      );

    if (phase === "available" || (!homebrew && phase === "ready")) {
      const ready = phase === "ready";
      let label = t("settings.updatesSettings.downloadUpdate");

      if (homebrew) label = t("settings.updatesSettings.updateWithHomebrew");
      else if (ready) label = t("settings.updatesSettings.restartAndInstall");

      return (
        <AsyncButton
          size="sm"
          label={label}
          onAction={homebrew || ready ? actions.install : actions.download}
          icon={ready ? <RotateCw size={14} /> : <Download size={14} />}
          variant="primary"
        >
          {label}
        </AsyncButton>
      );
    }
  }

  const canCheck = ["managed", "homebrew", "automatic"].includes(state.capability);

  if (!canCheck || ["available", "downloading", "ready", "installing"].includes(phase)) return null;

  return (
    <AsyncButton
      size="sm"
      label={t("settings.updatesSettings.checkForUpdates")}
      onAction={actions.check}
      icon={<RotateCw size={14} />}
      disabled={phase === "checking"}
    >
      {t("settings.updatesSettings.checkForUpdates")}
    </AsyncButton>
  );
}

export function UpdateStatus({
  state,
  actions,
  installedVersion,
}: {
  state: UpdateState;
  actions: UpdateActions;
  installedVersion?: string;
}) {
  const managed = state.capability === "managed";
  const phase =
    managed && ["downloading", "ready", "installing"].includes(state.phase)
      ? "available"
      : state.phase;
  const busy = ["checking", "downloading", "installing"].includes(phase);
  const Icon =
    phase === "error"
      ? CircleAlert
      : busy
        ? RotateCw
        : phase === "current" && !(state.capability === "homebrew" && state.reason)
          ? CircleCheck
          : ["available", "ready"].includes(phase)
            ? Download
            : Info;
  const detail = managed
    ? (state.reason ?? t("updates.managedExternally"))
    : state.capability === "homebrew"
      ? t("updates.managedBy", { manager: PACKAGE_MANAGER_NAMES.homebrew })
      : state.capability === "automatic"
        ? phase === "ready"
          ? t("appUpdateNotice.downloadedAndVerified")
          : null
        : state.reason;

  return (
    <div className="space-y-3 rounded-md border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-48 items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-bg-raised text-text-secondary">
            <Icon size={16} aria-hidden="true" className={busy ? "animate-spin-fast" : undefined} />
          </span>

          <div className="min-w-0 space-y-1">
            <p
              role="status"
              className="text-sm font-medium text-text-primary [overflow-wrap:anywhere]"
            >
              {statusText(state, phase)}
            </p>

            {detail && <p className="text-xs leading-relaxed text-text-secondary">{detail}</p>}
          </div>
        </div>

        <UpdateAction state={state} phase={phase} actions={actions} />
      </div>

      {(installedVersion || state.checkedAt) && (
        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-text-tertiary [overflow-wrap:anywhere]">
          {installedVersion && (
            <p>{t("appUpdateNotice.installedVersion", { version: installedVersion })}</p>
          )}
          {state.checkedAt && (
            <p>
              {t("settings.updatesSettings.lastChecked", {
                value1: formatDateTime(state.checkedAt),
              })}
            </p>
          )}
        </div>
      )}

      {state.capability === "automatic" && phase === "downloading" && (
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

      {state.release?.notes && (
        <div className="border-t border-border-subtle pt-3">
          <Disclosure title={t("settings.updatesSettings.whatSNew")}>
            <p className="selectable whitespace-pre-wrap text-sm leading-relaxed text-text-secondary [overflow-wrap:anywhere]">
              {state.release.notes}
            </p>
          </Disclosure>
        </div>
      )}
    </div>
  );
}

export function UpdatesSettings() {
  const { state, error, preview } = useUpdates();
  const automatic = useScopedSetting("automaticUpdateChecks", "application");
  const prereleases = useScopedSetting("includePrereleaseUpdates", "application");
  const [actionError, setActionError] = useState<string | null>(null);

  const automaticDescription = useId();
  const prereleaseDescription = useId();

  const updateInProgress =
    state !== null && ["checking", "downloading", "installing"].includes(state.phase);

  const run = async (action: keyof UpdateActions) => {
    setActionError(null);

    const simulation = useSimulationStore.getState();

    if (preview || simulation.update) return simulation.runUpdateAction(action);

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
          installedVersion={window.eda.app.version.displayVersion}
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

      {(error || (!preview && actionError)) && (
        <NoticeBanner tone="error">{error || actionError}</NoticeBanner>
      )}

      <div className="divide-y divide-border-subtle rounded-md border border-border-subtle">
        <Checkbox
          className="flex! w-full items-start! gap-3 px-3 py-3 [&>input]:mt-0.5"
          aria-label={t("settings.updatesSettings.checkForUpdatesAutomatically")}
          aria-describedby={automaticDescription}
          checked={automatic.resolved.value}
          disabled={automatic.reading}
          onChange={(event) => void automatic.set(event.currentTarget.checked)}
        >
          <span className="min-w-0 space-y-1">
            <span className="block text-sm">
              {t("settings.updatesSettings.checkForUpdatesAutomatically")}
            </span>
            <span
              id={automaticDescription}
              className="block text-xs leading-relaxed text-text-tertiary"
            >
              {t(
                state?.capability === "managed" || state?.capability === "homebrew"
                  ? "settings.updatesSettings.managedCheckSchedule"
                  : "settings.updatesSettings.installedBuildsCheckAfterStartupAndEverySix",
              )}
            </span>
          </span>
        </Checkbox>

        <Checkbox
          className="flex! w-full items-start! gap-3 px-3 py-3 [&>input]:mt-0.5"
          aria-label={t("settings.updatesSettings.includePrereleaseUpdates")}
          aria-describedby={prereleaseDescription}
          checked={prereleases.resolved.value}
          disabled={prereleases.reading || updateInProgress}
          onChange={(event) => void prereleases.set(event.currentTarget.checked)}
        >
          <span className="min-w-0 space-y-1">
            <span className="block text-sm">
              {t("settings.updatesSettings.includePrereleaseUpdates")}
            </span>
            <span
              id={prereleaseDescription}
              className="block text-xs leading-relaxed text-text-tertiary"
            >
              {t("settings.updatesSettings.prereleaseUpdatesDescription")}
            </span>
          </span>
        </Checkbox>
      </div>
    </section>
  );
}
