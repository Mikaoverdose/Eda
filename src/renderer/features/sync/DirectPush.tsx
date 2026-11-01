import type { GitErrorData } from "@shared/errors";
import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import {
  preferredRemote,
  remoteForTrackingRef,
  type PushPreview,
  type PushRequest,
  type TransportCredentials,
} from "@shared/integrations/remotes";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Dialog, Field, Input } from "../../components/ui/index";
import { ACTION_FEEDBACK } from "../../motion";
import { useAppStore } from "../../stores/app-store";
import { useRepositoryStore } from "../../stores/repository-store";
import { TransferProgress } from "./TransportFields";

export function DirectPush({
  repositoryId,
  afterCommit = false,
  disabled = false,
}: {
  repositoryId: string;
  afterCommit?: boolean;
  disabled?: boolean;
}) {
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PushPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [credentials, setCredentials] = useState<TransportCredentials>({
    username: "",
    password: "",
  });
  const [needsAuth, setNeedsAuth] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);
  const writing = useRepositoryStore((state) => state.writing);

  const runPush = async (mode: PushRequest["mode"], auth?: TransportCredentials) => {
    if (running.current) return;
    const identityId = useAppStore.getState().activeIdentity?.id;
    const current = () =>
      mounted.current &&
      useAppStore.getState().selectedRepositoryId === repositoryId &&
      useAppStore.getState().activeIdentity?.id === identityId;
    if (!current() || !identityId) return;
    running.current = true;
    const minimumPending = new Promise<void>((resolve) =>
      setTimeout(resolve, ACTION_FEEDBACK.minimumPending),
    );
    setBusy(true);
    setShowError(false);
    setError(null);
    setMessage(null);
    const fail = (failure: GitErrorData) => {
      if (!current()) return;
      setError(errorMessage(failure));
      setNeedsAuth(failure.kind === "auth-failed");
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
      const target = preferredRemote(inspected.value)?.name;
      if (!target) {
        setError(t("directPush.noRemoteIsConfiguredAddOneInSettingsRepoThenRetry"));
        return;
      }
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
      await minimumPending;
      running.current = false;
      if (current()) setBusy(false);
    }
  };

  useEffect(() => {
    if (afterCommit && !started.current) {
      started.current = true;
      void runPush("normal");
    }
  }, [afterCommit]);

  const confirmLease = async () => {
    if (!preview || running.current) return;
    const identityId = useAppStore.getState().activeIdentity?.id;
    const current = () =>
      mounted.current &&
      useAppStore.getState().selectedRepositoryId === repositoryId &&
      useAppStore.getState().activeIdentity?.id === identityId;
    if (!current() || !identityId) return;
    running.current = true;
    const minimumPending = new Promise<void>((resolve) =>
      setTimeout(resolve, ACTION_FEEDBACK.minimumPending),
    );
    setBusy(true);
    setError(null);
    try {
      const result = await window.eda.remotes.push(
        repositoryId,
        preview.token,
        credentials.password ? credentials : undefined,
      );
      if (!current()) return;
      if (!result.ok) {
        setError(errorMessage(result.error));
        setNeedsAuth(result.error.kind === "auth-failed");
        return;
      }
      setPreview(null);
      setMessage(result.value || t("directPush.pushCompleted"));
      await useRepositoryStore.getState().syncFromDisk();
    } catch {
      if (current()) setError(t("directPush.couldNotCompletePushTryAgain"));
    } finally {
      await minimumPending;
      running.current = false;
      if (current()) setBusy(false);
    }
  };

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
          onClose={() => {
            setError(null);
            setShowError(false);
            setNeedsAuth(false);
            setCredentials({ username: "", password: "" });
          }}
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
          {needsAuth && (
            <div className="mt-3 space-y-3">
              <Field label={t("directPush.username")}>
                {(field) => (
                  <Input
                    {...field}
                    value={credentials.username}
                    onChange={(event) =>
                      setCredentials({ ...credentials, username: event.target.value })
                    }
                    autoComplete="off"
                  />
                )}
              </Field>
              <Field label={t("directPush.accessToken")}>
                {(field) => (
                  <Input
                    {...field}
                    type="password"
                    value={credentials.password}
                    onChange={(event) =>
                      setCredentials({ ...credentials, password: event.target.value })
                    }
                    autoComplete="off"
                  />
                )}
              </Field>
            </div>
          )}
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
            {preview.source} → {preview.url} {preview.destination}
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
          {needsAuth && (
            <div className="mt-3 space-y-3">
              <Field label={t("directPush.username")}>
                {(field) => (
                  <Input
                    {...field}
                    value={credentials.username}
                    onChange={(event) =>
                      setCredentials({ ...credentials, username: event.target.value })
                    }
                    autoComplete="off"
                  />
                )}
              </Field>
              <Field label={t("directPush.accessToken")}>
                {(field) => (
                  <Input
                    {...field}
                    type="password"
                    value={credentials.password}
                    onChange={(event) =>
                      setCredentials({ ...credentials, password: event.target.value })
                    }
                    autoComplete="off"
                  />
                )}
              </Field>
            </div>
          )}
          {busy && (
            <TransferProgress repositoryId={repositoryId} kindKey="operationTitles.pushBranch" />
          )}
        </Dialog>
      )}
    </>
  );
}
