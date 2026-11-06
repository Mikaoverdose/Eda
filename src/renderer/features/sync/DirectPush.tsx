import type { GitErrorData } from "@shared/errors";
import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { isGitHubHttps } from "@shared/integrations/github";
import {
  preferredRemote,
  remoteForTrackingRef,
  type PushPreview,
  type PushRequest,
  type TransportCredentials,
} from "@shared/integrations/remotes";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Dialog } from "../../components/ui/index";
import { openSettings } from "../../commands/open-settings";
import { useRepositoryStore } from "../../stores/repository-store";
import { CredentialFields, TransferProgress } from "./TransportFields";
import { useTransportOperation } from "./hooks/useTransportOperation";
import { ProviderIcon } from "../connections/ProviderIcon";

export function DirectPush({
  repositoryId,
  afterCommit = false,
  disabled = false,
}: {
  repositoryId: string;
  afterCommit?: boolean;
  disabled?: boolean;
}) {
  const { busy, begin } = useTransportOperation(repositoryId);
  const [preview, setPreview] = useState<PushPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [credentials, setCredentials] = useState<TransportCredentials>({
    username: "",
    password: "",
  });
  const [needsAuth, setNeedsAuth] = useState(false);
  const [githubFailure, setGitHubFailure] = useState<"auth" | "access" | null>(null);
  const [githubRemote, setGitHubRemote] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);
  const writing = useRepositoryStore((state) => state.writing);

  const handleFailure = (failure: GitErrorData) => {
    setError(errorMessage(failure));

    const github =
      failure.kind === "github-auth-required"
        ? "auth"
        : failure.kind === "github-access-required"
          ? "access"
          : null;

    setGitHubFailure(github);
    const authentication = failure.kind === "auth-failed" || github !== null;
    setNeedsAuth(authentication);
    if (authentication) setPreview(null);
  };

  const closeAuthentication = () => {
    setError(null);
    setShowError(false);
    setNeedsAuth(false);
    setGitHubFailure(null);
    setCredentials({ username: "", password: "" });
  };

  const runPush = async (mode: PushRequest["mode"], auth?: TransportCredentials) => {
    const operation = begin();
    if (!operation) return;
    const { current } = operation;
    setShowError(false);
    setError(null);
    setMessage(null);
    setGitHubFailure(null);
    setGitHubRemote(false);
    const fail = (failure: GitErrorData) => {
      if (!current()) return;
      handleFailure(failure);
    };

    try {
      const inspected = await window.eda.remotes.inspect(repositoryId);
      if (!current()) return;
      if (!inspected.ok) return fail(inspected.error);
      const head = inspected.value.branches.find((branch) => branch.isHead && !branch.remote);
      if (!head) {
        setError(t("directPush.checkOutALocalBranchBeforePushing"));
        return;
      }
      const upstreamRemote = remoteForTrackingRef(inspected.value.remotes, head.upstream);
      const remote = upstreamRemote?.name;
      const destination = remote ? head.upstream!.slice(remote.length + 1) : head.name;
      const targetRemote = preferredRemote(inspected.value);
      if (!targetRemote) {
        setError(t("directPush.noRemoteIsConfiguredAddOneInSettingsRepoThenRetry"));
        return;
      }
      const target = targetRemote.name;
      const destinations = targetRemote.pushUrls.length
        ? targetRemote.pushUrls
        : targetRemote.fetchUrls;

      setGitHubRemote(destinations.length === 1 && isGitHubHttps(destinations[0]!));

      const request: PushRequest = {
        repositoryId,
        remote: target,
        branch: head.name,
        destination: remote === target ? destination : head.name,
        setUpstream: !head.upstream,
        mode,
        ...(auth ? { credentials: auth } : {}),
      };
      const prepared = await window.eda.remotes.preparePush(request);
      if (!current()) return;
      if (!prepared.ok) return fail(prepared.error);
      if (prepared.value.url) setGitHubRemote(isGitHubHttps(prepared.value.url));
      if (mode === "normal") {
        const pushed = await window.eda.remotes.push(repositoryId, prepared.value.token, auth);
        if (!current()) return;
        if (!pushed.ok) {
          if (pushed.error.kind === "non-fast-forward") {
            const lease = await window.eda.remotes.preparePush({ ...request, mode: "lease" });
            if (!current()) return;
            if (!lease.ok) return fail(lease.error);
            setPreview(lease.value);
            return;
          }
          return fail(pushed.error);
        }
        setMessage(pushed.value || t("directPush.pushCompleted"));
        setNeedsAuth(false);
        await useRepositoryStore.getState().syncFromDisk();
        return;
      }
      setPreview(prepared.value);
    } catch {
      if (current()) setError(t("directPush.couldNotCompletePushTryAgain"));
    } finally {
      await operation.finish();
    }
  };

  useEffect(() => {
    if (afterCommit && !started.current) {
      started.current = true;
      void runPush("normal");
    }
  }, [afterCommit]);

  const confirmLease = async () => {
    if (!preview) return;
    const operation = begin();
    if (!operation) return;
    const { current } = operation;
    setError(null);
    setGitHubFailure(null);
    try {
      const result = await window.eda.remotes.push(
        repositoryId,
        preview.token,
        credentials.password ? credentials : undefined,
      );
      if (!current()) return;
      if (!result.ok) {
        handleFailure(result.error);
        return;
      }
      setPreview(null);
      setMessage(result.value || t("directPush.pushCompleted"));
      await useRepositoryStore.getState().syncFromDisk();
    } catch {
      if (current()) setError(t("directPush.couldNotCompletePushTryAgain"));
    } finally {
      await operation.finish();
    }
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
              closeAuthentication();
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
      {!afterCommit && (
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
      {error && !preview && (showError || needsAuth || afterCommit) && (
        <Dialog
          title={needsAuth ? t("directPush.hTtpsAuthentication") : t("directPush.pushFailed")}
          {...(needsAuth
            ? { description: t("directPush.enterYourGitUsernameAndAccessTokenToRetry") }
            : {})}
          onClose={closeAuthentication}
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
              <Button variant="quiet" onClick={() => setError(null)}>
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
          onClose={() => setPreview(null)}
          footer={
            <>
              <Button variant="quiet" disabled={busy} onClick={() => setPreview(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={
                  busy || (needsAuth && (!credentials.username.trim() || !credentials.password))
                }
                onClick={() => void confirmLease()}
              >
                {needsAuth ? t("directPush.retryForceWithLease") : t("directPush.forceWithLease")}
              </Button>
            </>
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
