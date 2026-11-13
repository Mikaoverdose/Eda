import { t } from "@shared/i18n";
import { useEffect } from "react";
import { ArrowUpIcon as ArrowUp } from "../../components/ui/icons";
import { DialogActions, Button, Dialog } from "../../components/ui/index";
import { openSettings } from "../../stores/shell-store";
import { useRepositoryStore } from "../../stores/repository-store";
import { CredentialFields, TransferProgress } from "./TransportFields";
import { useDirectPush, type PushTagTarget } from "./hooks/useDirectPush";
import { ProviderIcon } from "../connections/ProviderIcon";

export function DirectPush({
  repositoryId,
  afterCommit = false,
  disabled = false,
  tag,
  onClose,
  onChanged,
}: {
  repositoryId: string;
  afterCommit?: boolean;
  disabled?: boolean;
  tag?: PushTagTarget;
  onClose?: () => void;
  onChanged?: (() => void) | undefined;
}) {
  const autoStart = afterCommit || !!tag;
  const {
    busy,
    preview,
    setPreview,
    error,
    setError,
    showError,
    setShowError,
    credentials,
    setCredentials,
    needsAuth,
    setNeedsAuth,
    githubFailure,
    githubRemote,
    message,
    closeAuthentication,
    runPush,
    confirmLease,
  } = useDirectPush(repositoryId, autoStart, tag);

  const writing = useRepositoryStore((state) => state.writing);

  useEffect(() => {
    if (tag && message && !busy) {
      onChanged?.();
      onClose?.();
    }
  }, [tag, message, busy, onChanged, onClose]);

  const close = () => {
    setPreview(null);
    closeAuthentication();
    onClose?.();
  };

  const credentialFields = needsAuth && (
    <div className="mt-3 space-y-3">
      <CredentialFields shortLabels value={credentials} onChange={setCredentials} disabled={busy} />

      {githubRemote && (
        <div className="space-y-2 border-t border-border-subtle pt-3">
          <p className="text-xs text-text-secondary">
            {githubFailure === "access"
              ? t("directPush.gitHubAccessChoice")
              : t("directPush.gitHubAuthenticationChoice")}
          </p>

          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            icon={<ProviderIcon provider="GitHub" />}
            onClick={() => {
              close();
              openSettings("integrations");
            }}
          >
            {t("directPush.useGitHubIntegration")}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {!autoStart && (
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || writing || busy}
          busy={busy}
          feedback={error ? "error" : message ? "success" : "idle"}
          icon={<ArrowUp size={14} />}
          title={
            error ? t("directPush.pushFailedClickForDetails") : (message ?? t("directPush.push"))
          }
          onClick={() => (error ? setShowError(true) : void runPush("normal"))}
        >
          {t("directPush.push")}
        </Button>
      )}

      <span role="status" className="sr-only">
        {busy ? t("directPush.pushing") : (error ?? message)}
      </span>

      {error && !preview && (showError || needsAuth || autoStart) && (
        <Dialog
          title={needsAuth ? t("directPush.hTtpsAuthentication") : t("directPush.pushFailed")}
          {...(needsAuth
            ? { description: t("directPush.enterYourGitUsernameAndAccessTokenToRetry") }
            : {})}
          onClose={close}
          footer={
            needsAuth ? (
              <Button
                variant="primary"
                disabled={!credentials.username.trim() || !credentials.password || busy}
                onClick={() => {
                  setError(null);
                  setNeedsAuth(false);
                  void runPush("normal", credentials);
                }}
              >
                {t("directPush.retryPush")}
              </Button>
            ) : (
              <Button variant="quiet" onClick={close}>
                {t("common.close")}
              </Button>
            )
          }
        >
          <p role="alert" className="text-sm text-git-deleted">
            {error}
          </p>
          {credentialFields}
        </Dialog>
      )}

      {preview && (
        <Dialog
          title={t("directPush.forcePush")}
          description={t("directPush.thisPushReplacesRemoteHistoryForceWithLease")}
          onClose={close}
          busy={busy}
          footer={
            <DialogActions
              onClose={close}
              onConfirm={() => void confirmLease()}
              confirmLabel={
                needsAuth ? t("directPush.retryForceWithLease") : t("directPush.forceWithLease")
              }
              busy={busy}
              confirmDisabled={needsAuth && (!credentials.username.trim() || !credentials.password)}
            />
          }
        >
          <p className="break-all text-sm">
            {t("directPush.destinationDescription", {
              source: preview.source,
              url: preview.url,
              destination: preview.destination,
            })}
          </p>

          <p className="mt-2 text-xs text-text-secondary">
            {t("directPush.localRemote", {
              value1: preview.localOid?.slice(0, 12) ?? "—",
              value2: preview.remoteOid?.slice(0, 12) ?? t("directPush.newRef"),
            })}
          </p>

          {error && (
            <p role="alert" className="mt-3 text-sm text-git-deleted">
              {error}
            </p>
          )}

          {credentialFields}
          {busy && (
            <TransferProgress repositoryId={repositoryId} kindKey="operationTitles.pushBranch" />
          )}
        </Dialog>
      )}
    </>
  );
}
