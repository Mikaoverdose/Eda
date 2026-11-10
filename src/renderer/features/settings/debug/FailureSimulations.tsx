import { ERROR_CODE } from "@shared/error-codes";
import { AppError, errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { useState } from "react";
import { Button } from "../../../components/ui/actions/Button";
import { DialogActions } from "../../../components/ui/actions/DialogActions";
import { ActionList } from "../../../components/ui/display/ActionList";
import { NoticeBanner } from "../../../components/ui/feedback/NoticeBanner";
import { Dialog } from "../../../components/ui/overlays/Dialog";
import { ErrorDialog } from "../../../components/ui/overlays/ErrorDialog";

export function FailureSimulations() {
  const [renderError, setRenderError] = useState(false);
  const [confirmRenderError, setConfirmRenderError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (renderError) throw new AppError(ERROR_CODE.DEBUG_RENDER_FAILURE);

  async function debug(action: "open-dev-tools" | "ipc-error" | "renderer-crash") {
    setBusy(true);
    setStatus(null);
    setError(null);

    try {
      const result = await window.eda.app.debug(action);

      if (!result.ok) setError(errorMessage(result.error));
      else if (action === "open-dev-tools")
        setStatus(
          t("settings.failureSimulations.developerToolsOpenedSelectConsoleToInspectErrors"),
        );
    } catch {
      setError(t("settings.failureSimulations.theDebugRequestCouldNotFinishReloadEda"));
    } finally {
      setBusy(false);
    }
  }

  const simulations = [
    {
      title: t("settings.failureSimulations.reactRenderError"),
      description: t("settings.failureSimulations.replaceTheInterfaceWithEdaSErrorRecovery"),
      label: t("settings.failureSimulations.triggerRenderError"),
      run: () => setConfirmRenderError(true),
      danger: true,
    },
    {
      title: t("settings.failureSimulations.uncaughtRuntimeError"),
      description: t("settings.failureSimulations.throwFromAnAsynchronousCallbackTheWindowStays"),
      label: t("settings.failureSimulations.throwRuntimeError"),
      run: () => {
        setError(null);
        setStatus(t("settings.failureSimulations.runtimeErrorTriggeredCheckTheDeveloperConsole"));

        window.setTimeout(() => {
          throw new AppError(ERROR_CODE.DEBUG_RUNTIME_FAILURE);
        }, 0);
      },
    },
    {
      title: t("settings.failureSimulations.unhandledPromiseRejection"),
      description: t("settings.failureSimulations.rejectAPromiseWithoutAHandlerToExercise"),
      label: t("settings.failureSimulations.rejectPromise"),
      run: () => {
        setError(null);

        setStatus(
          t("settings.failureSimulations.unhandledRejectionTriggeredCheckTheDeveloperConsole"),
        );

        void Promise.reject(new AppError(ERROR_CODE.DEBUG_UNHANDLED_REJECTION));
      },
    },
    {
      title: t("settings.failureSimulations.unexpectedIpcError"),
      description: t("settings.failureSimulations.failARequestInTheMainProcessAnd"),
      label: t("settings.failureSimulations.failIpcRequest"),
      run: () => void debug("ipc-error"),
    },
    {
      title: t("settings.failureSimulations.rendererProcessCrash"),
      description: t("settings.failureSimulations.crashTheCurrentWindowSRendererAfterConfirmation"),
      label: t("settings.failureSimulations.crashRenderer"),
      run: () => void debug("renderer-crash"),
      danger: true,
    },
  ];

  return (
    <div className="space-y-6">
      <NoticeBanner tone="warning">
        {t("settings.failureSimulations.theseActionsDeliberatelyCauseRealFailuresSaveYour")}
      </NoticeBanner>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {t(
            "settings.failureSimulations.inspectRuntimeErrorsAndPromiseRejectionsInTheDeveloperConsole",
          )}
        </p>

        <Button disabled={busy} onClick={() => void debug("open-dev-tools")}>
          {t("settings.failureSimulations.openDeveloperTools")}
        </Button>
      </div>

      <ActionList
        items={simulations.map((simulation) => ({
          id: simulation.title,
          title: simulation.title,
          description: simulation.description,
          actions: (
            <Button
              variant={simulation.danger ? "danger" : "secondary"}
              disabled={busy}
              onClick={simulation.run}
            >
              {simulation.label}
            </Button>
          ),
        }))}
      />

      <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>

      {status && (
        <p role="status" className="text-sm text-text-secondary">
          {status}
        </p>
      )}

      {confirmRenderError && (
        <Dialog
          title={t("settings.failureSimulations.confirmRenderError")}
          description={t("settings.failureSimulations.theInterfaceWillBeReplacedByTheRecovery")}
          onClose={() => setConfirmRenderError(false)}
          footer={
            <DialogActions
              onClose={() => setConfirmRenderError(false)}
              onConfirm={() => setRenderError(true)}
              confirmLabel={t("settings.failureSimulations.triggerRenderErrorAction")}
              confirmVariant="danger"
              closeVariant="secondary"
            />
          }
        >
          <p className="text-sm text-text-secondary">
            {t(
              "settings.failureSimulations.chooseReloadEdaOnTheRecoveryScreenToRestoreYourLastSavedSession",
            )}
          </p>
        </Dialog>
      )}
    </div>
  );
}
