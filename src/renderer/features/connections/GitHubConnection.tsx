import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { GitHubAccountProfile, GitHubSignIn, GitHubStatus } from "@shared/integrations/github";
import { Copy, ExternalLink, Unplug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConnectionProfile } from "./ConnectionProfile";
import { Button, CodeBlock, CopyButton, ActionsMenu, Skeleton } from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";
import { ServiceAccountCard } from "./ServiceAccountCard";
import { ConnectionAccountSkeleton, ConnectionActionSkeleton } from "./ConnectionSkeleton";
import { ProfileAvatar } from "../../components/ui/display/ProfileAvatar";

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
  const [profile, setProfile] = useState<GitHubAccountProfile | null>(null);
  const hue = useAppStore((state) => state.activeIdentity?.hue ?? 210);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [connectRequested, setConnectRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSignIn, setCopiedSignIn] = useState<string | null>(null);
  const alive = useRef(true);
  const current = useRef<GitHubSignIn | null>(null);
  const signedIn = status?.account?.state === "connected";

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
      if (current.current) void window.eda.github.cancel(profileId, current.current.id);
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
          current.current = null;
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
    if (!busy && !pending && !signedIn && status.secureStorage) void begin();
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
    setBusy(true);
    setError(null);

    try {
      const result = await window.eda.github.disconnect(profileId);
      if (!alive.current) return;

      if (result.ok) {
        setExpanded(false);
        setConnectRequested(false);
        const refreshed = await window.eda.github.status(profileId);
        if (alive.current && refreshed.ok) setStatus(refreshed.value);
      } else setError(errorMessage(result.error));
    } catch {
      if (alive.current) setError(t("settings.gitHubConnection.couldNotDisconnectGitHubTryAgain"));
    } finally {
      if (alive.current) setBusy(false);
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

  useEffect(() => {
    if (isConnected) setExpanded(false);
  }, [compact, isConnected]);

  const loading = !status || !!(account && profileReadyFor !== account.id);

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
      completedLabel={isConnected ? t("settings.gitHubConnection.gitHubConnected") : undefined}
      actionsPlacement={pending || starting ? "body" : "header"}
      contentClassName={pending ? "min-h-20" : ""}
      bodySeparator={!account || !!pending || !!error}
      bodyOpen={!!pending || starting || !!error || !!(status && !status.secureStorage)}
      summary={
        loading && account ? (
          <ConnectionAccountSkeleton login={account.login} hue={hue} />
        ) : account ? (
          <ConnectionProfile
            login={login ?? account.login}
            name={details?.name}
            avatarDataUrl={details?.avatarDataUrl}
            hue={hue}
            profileLabel={t("settings.gitHubConnection.viewOnGitHub", {
              login: login ?? account.login,
            })}
            connected={isConnected}
            bio={details?.bio}
            location={details?.location}
            onOpenProfile={() => void openProfile()}
          />
        ) : null
      }
      pendingLabel={
        starting
          ? t("settings.gitHubConnection.gettingGitHubCode")
          : pending
            ? t("settings.gitHubConnection.waitingForGitHub")
            : loading && compact
              ? t("settings.gitHubConnection.loadingGitHub")
              : undefined
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
              {t("common.cancel")}
            </Button>
          </>
        ) : loading && compact ? null : loading && !account ? (
          <ConnectionActionSkeleton label={t("settings.gitHubConnection.signInWithGitHub")} />
        ) : status ? (
          <>
            {!isConnected && !compact && (
              <Button
                size="sm"
                busy={busy}
                disabled={!status.secureStorage}
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

            {account &&
              (compact ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t("settings.gitHubConnection.disconnectGitHub")}
                  disabled={busy}
                  onClick={() => void disconnect()}
                >
                  {t("settings.gitHubConnection.disconnect")}
                </Button>
              ) : (
                <ActionsMenu
                  label={t("settings.connections.manage", { provider: "GitHub" })}
                  disabled={busy}
                  items={[
                    {
                      label: t("settings.gitHubConnection.disconnect"),
                      icon: <Unplug size={14} />,
                      danger: true,
                      onSelect: () => void disconnect(),
                    },
                  ]}
                />
              ))}
          </>
        ) : null
      }
    >
      {error && (
        <p role="alert" className="text-xs text-git-deleted">
          {error}
        </p>
      )}

      {loading && compact ? (
        <div aria-hidden="true" className="space-y-3">
          <div className="flex items-center gap-3">
            <ProfileAvatar name={account?.login ?? ""} hue={hue} loading />

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
      ) : account && compact ? (
        <div>
          <ConnectionProfile
            key={account.id}
            login={login ?? account.login}
            name={details?.name}
            bio={details?.bio}
            location={details?.location}
            avatarDataUrl={details?.avatarDataUrl}
            hue={hue}
            profileLabel={t("settings.gitHubConnection.viewOnGitHub", {
              login: login ?? account.login,
            })}
            onOpenProfile={() => void openProfile()}
          />
        </div>
      ) : null}

      {status && !status.secureStorage && (
        <p className="text-xs text-git-modified">
          {t("settings.gitHubConnection.unlockYourOsKeychainAndRestartEdaToSaveAGitHubLogin")}
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
