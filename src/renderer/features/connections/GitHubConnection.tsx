import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type {
  GitHubAccountProfile,
  GitHubRepositoryAccess,
  GitHubSignIn,
  GitHubStatus,
} from "@shared/integrations/github";
import {
  GITHUB_INSTALLATION_POLL_MS,
  GITHUB_INSTALLATION_WAIT_MS,
} from "@shared/integrations/github";
import { Copy, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GitHubProfile } from "./GitHubProfile";
import {
  ActionIndicator,
  Button,
  CodeBlock,
  CopyButton,
  ErrorDialog,
  Skeleton,
} from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";
import { ServiceAccountCard } from "./ServiceAccountCard";

export function GitHubConnection({
  profileId,
  compact = false,
}: {
  profileId: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [pending, setPending] = useState<GitHubSignIn | null>(null);
  const [profileReadyFor, setProfileReadyFor] = useState<string | null>(null);
  const [accessReadyFor, setAccessReadyFor] = useState<string | null>(null);
  const [profile, setProfile] = useState<GitHubAccountProfile | null>(null);
  const hue = useAppStore((state) => state.activeIdentity?.hue ?? 210);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [connectRequested, setConnectRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSignIn, setCopiedSignIn] = useState<string | null>(null);
  const alive = useRef(true);
  const current = useRef<GitHubSignIn | null>(null);
  const [access, setAccess] = useState<GitHubRepositoryAccess | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [accessWaitExpired, setAccessWaitExpired] = useState(false);
  const accessWaitStarted = useRef<number | null>(null);
  const accessInFlight = useRef(false);
  const accessRequest = useRef(0);
  const finishSignIn = useRef(false);
  const authorizedSignIn = useRef<string | null>(null);

  const checkAccess = useCallback(
    async (accountId: string, openIfRequired = false) => {
      if (accessInFlight.current) return false;
      accessInFlight.current = true;
      const request = ++accessRequest.current;
      const valid = () => alive.current && request === accessRequest.current;
      const finish = (update: () => void = () => {}) => {
        if (!valid()) return;
        update();
        setAccessReadyFor(accountId);
        setCheckingAccess(false);
        accessInFlight.current = false;
      };
      setCheckingAccess(true);
      setError(null);
      try {
        const result = await window.eda.github.repositoryAccess(profileId);
        if (!valid()) return;
        if (!result.ok) {
          const refreshed =
            result.error.kind === "github-auth-required"
              ? await window.eda.github.status(profileId)
              : null;
          finish(() => {
            setAccess(null);
            if (refreshed?.ok) setStatus(refreshed.value);
            setError(errorMessage(result.error));
          });
          return false;
        }
        if (result.value.accountId !== accountId) {
          finish();
          return false;
        }
        const refreshed = result.value.accounts.length
          ? await window.eda.github.status(profileId)
          : null;
        finish(() => {
          if (refreshed?.ok) setStatus(refreshed.value);
          setAccess(result.value);
          if (result.value.accounts.length) {
            setAccessWaitExpired(false);
            accessWaitStarted.current = null;
            authorizedSignIn.current = null;
          }
        });
        if (openIfRequired && result.value.accounts.length === 0) {
          const opened = await window.eda.github.openInstallations(profileId);
          if (valid() && !opened.ok) setError(errorMessage(opened.error));
        }
        return true;
      } catch {
        finish(() => {
          setAccess(null);
          setError(t("settings.gitHubConnection.couldNotCheckRepositoryAccessTryAgain"));
        });
        return false;
      }
    },
    [profileId],
  );

  const accountId = status?.pendingAccountId ?? status?.account?.id;
  const signedIn = !!status?.pendingAccountId || status?.account?.state === "connected";
  useEffect(() => {
    setAccess(null);
    accessWaitStarted.current = null;
    setAccessWaitExpired(false);
    if (!accountId || !signedIn) return;
    const continueConnection = finishSignIn.current && status.installationAvailable;
    finishSignIn.current = false;
    void checkAccess(accountId, continueConnection);
    const onFocus = () => void checkAccess(accountId);
    window.addEventListener("focus", onFocus);
    return () => {
      ++accessRequest.current;
      accessInFlight.current = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [accountId, signedIn, status?.installationAvailable, checkAccess]);

  useEffect(() => {
    if (!accountId || !signedIn) return;
    return window.eda.events?.onGitHubInstallationChanged?.((owner) => {
      if (owner === profileId) void checkAccess(accountId);
    });
  }, [accountId, signedIn, profileId, checkAccess]);

  const awaitingInstallation =
    signedIn && access?.accountId === accountId && access?.accounts.length === 0;
  useEffect(() => {
    if (!awaitingInstallation || !accountId || accessWaitExpired || checkingAccess) return;
    accessWaitStarted.current ??= Date.now();
    const timer = setTimeout(() => {
      if (Date.now() - accessWaitStarted.current! >= GITHUB_INSTALLATION_WAIT_MS) {
        setAccessWaitExpired(true);
        setError(
          t(
            "settings.gitHubConnection.repositoryAccessWasNotConfirmedChooseEnableAccessToTryAgain",
          ),
        );
        return;
      }
      void checkAccess(accountId);
    }, GITHUB_INSTALLATION_POLL_MS);
    return () => clearTimeout(timer);
  }, [awaitingInstallation, accountId, accessWaitExpired, checkingAccess, checkAccess]);

  useEffect(() => {
    alive.current = true;
    let active = true;
    void window.eda.github
      .status(profileId)
      .then((result) => {
        if (!active) return;
        if (result.ok) setStatus(result.value);
        else setError(errorMessage(result.error));
      })
      .catch(() => {
        if (active)
          setError(
            t("settings.gitHubConnection.couldNotLoadTheGitHubConnectionReopenSettingsAndTryAgain"),
          );
      });
    return () => {
      active = false;
      alive.current = false;
      ++accessRequest.current;
      if (current.current) void window.eda.github.cancel(profileId, current.current.id);
      if (authorizedSignIn.current)
        void window.eda.github.cancel(profileId, authorizedSignIn.current);
      authorizedSignIn.current = null;
      current.current = null;
    };
  }, [profileId]);

  useEffect(() => {
    let active = true;
    setProfile(null);
    const accountId = status?.account?.id;
    if (accountId)
      void window.eda.github
        .profile(profileId)
        .then((result) => {
          if (active && result.ok && result.value?.id === accountId) setProfile(result.value);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setProfileReadyFor(accountId);
        });
    return () => {
      active = false;
    };
  }, [profileId, status?.account?.id]);

  useEffect(() => {
    if (!pending) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!active || current.current?.id !== pending.id) return;
      if (Date.now() >= pending.expiresAt) {
        void window.eda.github.cancel(profileId, pending.id);
        current.current = null;
        setPending(null);
        setError(t("settings.gitHubConnection.theVerificationCodeExpiredSignInWithGitHubAgain"));
        return;
      }
      try {
        const result = await window.eda.github.poll(profileId, pending.id);
        if (!active || current.current?.id !== pending.id) return;
        if (!result.ok) {
          current.current = null;
          setPending(null);
          setError(errorMessage(result.error));
        } else if (result.value.state !== "pending") {
          const connectedStatus = result.value.status;
          authorizedSignIn.current = connectedStatus.pendingAccountId ? pending.id : null;
          current.current = null;
          finishSignIn.current = true;
          setPending(null);
          setStatus(connectedStatus);
        } else
          timer = setTimeout(
            () => void poll(),
            Math.min(result.value.intervalMs, Math.max(0, pending.expiresAt - Date.now())),
          );
      } catch {
        if (active) {
          void window.eda.github.cancel(profileId, pending.id);
          current.current = null;
          setPending(null);
          setError(t("settings.gitHubConnection.couldNotCompleteGitHubSignInTryAgain"));
        }
      }
    };
    timer = setTimeout(() => void poll(), pending.intervalMs);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pending, profileId]);

  const openBrowser = async (signIn: GitHubSignIn) => {
    setError(null);
    try {
      const result = await window.eda.github.openVerification(profileId, signIn.id);
      if (!alive.current || current.current?.id !== signIn.id) return;
      if (result.ok) setCopiedSignIn(signIn.id);
      else setError(errorMessage(result.error));
    } catch {
      if (alive.current)
        setError(t("settings.gitHubConnection.couldNotCopyTheCodeAndOpenGitHubTryAgain"));
    }
  };
  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.eda.github.begin(profileId);
      if (!alive.current) {
        if (result.ok) void window.eda.github.cancel(profileId, result.value.id);
        return;
      }
      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }
      current.current = result.value;
      setPending(result.value);
      await openBrowser(result.value);
    } catch {
      if (alive.current) setError(t("settings.gitHubConnection.couldNotStartGitHubSignInTryAgain"));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  useEffect(() => {
    if (!connectRequested || !status) return;
    setConnectRequested(false);
    if (!busy && !pending && !signedIn && status.configured && status.secureStorage) void begin();
  }, [connectRequested, status, busy, pending, signedIn]);

  const cancel = () => {
    setExpanded(false);
    setConnectRequested(false);
    if (current.current) void window.eda.github.cancel(profileId, current.current.id);
    current.current = null;
    setPending(null);
    setError(null);
  };
  const disconnect = async () => {
    ++accessRequest.current;
    setCheckingAccess(false);
    accessInFlight.current = false;
    accessWaitStarted.current = null;
    setAccessWaitExpired(false);
    setBusy(true);
    setError(null);
    try {
      const authorization = authorizedSignIn.current;
      const result = authorization
        ? await window.eda.github.cancel(profileId, authorization)
        : await window.eda.github.disconnect(profileId);
      if (!alive.current) return;
      if (result.ok) {
        setExpanded(false);
        setConnectRequested(false);
        authorizedSignIn.current = null;
        const refreshed = await window.eda.github.status(profileId);
        if (alive.current && refreshed.ok) setStatus(refreshed.value);
      } else setError(errorMessage(result.error));
    } catch {
      if (alive.current) setError(t("settings.gitHubConnection.couldNotDisconnectGitHubTryAgain"));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const installations = async () => {
    accessWaitStarted.current = Date.now();
    setAccessWaitExpired(false);
    try {
      const result = await window.eda.github.openInstallations(profileId);
      if (alive.current && !result.ok) setError(errorMessage(result.error));
    } catch {
      if (alive.current) setError(t("settings.gitHubConnection.couldNotOpenGitHubTryAgain"));
    }
  };

  const openProfile = async () => {
    try {
      const result = await window.eda.github.openProfile(profileId);
      if (alive.current && !result.ok) setError(errorMessage(result.error));
    } catch {
      if (alive.current)
        setError(t("settings.gitHubConnection.couldNotOpenTheGitHubProfileTryAgain"));
    }
  };

  const account = status?.account;
  const isConnected = signedIn;
  const pendingInstallation = !!status?.pendingAccountId;
  const hasAccess = access?.accountId === account?.id && !!access?.accounts.length;
  const completed = isConnected && hasAccess;
  useEffect(() => {
    if (compact && completed) setExpanded(false);
  }, [compact, completed]);
  const awaitingAccess = awaitingInstallation && !accessWaitExpired;
  const loading =
    !status ||
    !!(
      account &&
      (profileReadyFor !== account.id || (isConnected && accessReadyFor !== account.id))
    );

  const starting = busy && !pending && !signedIn;
  const details = profile?.id === account?.id ? profile : null;
  const login = details?.login ?? account?.login;

  return (
    <ServiceAccountCard
      provider={"GitHub"}
      compact={compact}
      open={expanded}
      onOpenChange={(open) => {
        setExpanded(open);
        setConnectRequested(open);
      }}
      completedLabel={
        isConnected && hasAccess ? t("settings.gitHubConnection.gitHubConnected") : undefined
      }
      contentClassName={loading || account || pending ? "min-h-20" : ""}
      status={
        starting || pending || checkingAccess || awaitingAccess || loading ? (
          <span
            role="status"
            aria-label={
              starting
                ? t("settings.gitHubConnection.gettingGitHubCode")
                : pending
                  ? t("settings.gitHubConnection.waitingForGitHub")
                  : checkingAccess
                    ? t("settings.gitHubConnection.checkingAccess")
                    : awaitingAccess
                      ? t("settings.gitHubConnection.waitingForRepositoryAccess")
                      : t("settings.gitHubConnection.loadingGitHub")
            }
            className="text-text-tertiary"
          >
            <ActionIndicator state="pending" />
          </span>
        ) : account && !compact ? (
          <span role="status" className="sr-only">
            {account.state === "expired"
              ? t("settings.gitHubConnection.reconnectRequired")
              : hasAccess
                ? t("settings.gitHubConnection.connected")
                : t("settings.gitHubConnection.accessNotVerified")}
          </span>
        ) : null
      }
      actions={
        pending || starting ? (
          <>
            <Button
              size="sm"
              icon={<ExternalLink size={13} />}
              disabled={!pending}
              onClick={() => pending && void openBrowser(pending)}
            >
              {t("settings.gitHubConnection.openGitHub")}
            </Button>
            <Button size="sm" variant="ghost" disabled={starting} onClick={cancel}>
              {t("settings.gitHubConnection.cancelSignIn")}
            </Button>
          </>
        ) : loading && compact ? null : loading ? (
          <div aria-hidden="true" className="flex items-center gap-3">
            <Skeleton className="h-8 w-32 rounded-md" />
            <Skeleton className="h-4 w-16" />
          </div>
        ) : status ? (
          <>
            {!isConnected && !compact && (
              <Button
                size="sm"
                busy={busy}
                disabled={!status.configured || !status.secureStorage}
                onClick={() => void begin()}
              >
                {compact
                  ? account
                    ? t("settings.gitHubConnection.reconnect")
                    : t("settings.gitHubConnection.connect")
                  : account
                    ? t("settings.gitHubConnection.reconnectGitHub")
                    : t("settings.gitHubConnection.signInWithGitHub")}
              </Button>
            )}
            {isConnected && status.installationAvailable && (
              <Button
                size="sm"
                disabled={busy}
                icon={<ExternalLink size={13} />}
                onClick={() => void installations()}
              >
                {hasAccess
                  ? t("settings.gitHubConnection.manageAccess")
                  : t("settings.gitHubConnection.enableAccess")}
              </Button>
            )}
            {(account || pendingInstallation) && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("settings.gitHubConnection.disconnectGitHub")}
                disabled={busy}
                onClick={() => void disconnect()}
              >
                {pendingInstallation
                  ? t("settings.gitHubConnection.cancelSignIn")
                  : t("settings.gitHubConnection.disconnect")}
              </Button>
            )}
          </>
        ) : null
      }
    >
      <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      {loading ? (
        <div aria-hidden="true" className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-4 w-4/5" />
          <div className="flex items-start gap-1.5">
            <Skeleton className="mt-0.5 size-3.5 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ) : pendingInstallation ? (
        <p className="text-xs text-text-secondary">
          {t("settings.gitHubConnection.allowRepositoryAccessOnGitHub")}
        </p>
      ) : account ? (
        <GitHubProfile
          key={account.id}
          login={login ?? account.login}
          name={details?.name}
          bio={details?.bio}
          location={details?.location}
          avatarDataUrl={details?.avatarDataUrl}
          hue={hue}
          onOpenProfile={() => void openProfile()}
        />
      ) : null}
      {status && !status.secureStorage && (
        <p className="text-xs text-git-modified">
          {t("settings.gitHubConnection.unlockYourOsKeychainAndRestartEdaToSaveAGitHubLogin")}
        </p>
      )}
      {status && !status.configured && (
        <p className="text-xs text-text-tertiary">
          {t("settings.gitHubConnection.gitHubSignInIsNotConfiguredInThisBuild")}
        </p>
      )}
      {pending || starting ? (
        <div className="max-w-sm space-y-3" aria-busy={starting}>
          <p className="text-xs text-text-secondary">
            {t("settings.gitHubConnection.enterThisCodeOnGitHub", {
              value1:
                pending && copiedSignIn === pending.id
                  ? t("gitHubConnection.codeCopiedToClipboard")
                  : "",
            })}
          </p>
          <div className="relative">
            <CodeBlock
              label={t("settings.gitHubConnection.gitHubVerificationCode")}
              className="pr-12"
            >
              {pending ? (
                pending.userCode
              ) : (
                <span aria-hidden="true" className="inline-flex items-center align-middle">
                  <span className="ui-skeleton inline-block h-[1em] w-[4ch] rounded-sm bg-border-subtle" />
                  <span className="text-text-tertiary">-</span>
                  <span className="ui-skeleton inline-block h-[1em] w-[4ch] rounded-sm bg-border-subtle" />
                </span>
              )}
            </CodeBlock>
            <div className="absolute inset-y-0 right-1 flex items-center">
              {pending ? (
                <CopyButton
                  key={pending.id}
                  value={pending.userCode}
                  copied={copiedSignIn === pending.id}
                  label={t("settings.gitHubConnection.copyCode")}
                />
              ) : (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("settings.gitHubConnection.copyCode")}
                  disabled
                >
                  <Copy size={14} aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </ServiceAccountCard>
  );
}
