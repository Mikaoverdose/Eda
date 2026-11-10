import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { GitLabSignIn, GitLabStatus, GitLabAccountProfile } from "@shared/integrations/gitlab";
import { useEffect, useRef, useState } from "react";
import { ExternalLinkIcon as ExternalLink, UnplugIcon as Unplug } from "../../components/ui/icons";
import { Button, ActionsMenu } from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";
import { ServiceAccountCard } from "./ServiceAccountCard";
import { ConnectionProfile } from "./ConnectionProfile";
import { ConnectionAccountSkeleton, ConnectionActionSkeleton } from "./ConnectionSkeleton";

export function GitLabConnection({
  profileId,
  compact = false,
}: {
  profileId: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<GitLabStatus | null>(null);
  const [profileReadyFor, setProfileReadyFor] = useState<string | null>(null);
  const [profile, setProfile] = useState<GitLabAccountProfile | null>(null);
  const [pending, setPending] = useState<GitLabSignIn | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [connectRequested, setConnectRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const current = useRef<GitLabSignIn | null>(null);
  const hue = useAppStore((state) => state.activeIdentity?.hue ?? 210);
  const loading = !status || !!(status.account && profileReadyFor !== status.account.id);
  const connected = status?.account?.state === "connected";

  useEffect(() => {
    alive.current = true;

    void window.eda.gitlab
      .status(profileId)
      .then((result) => {
        if (!alive.current) return;
        if (result.ok) setStatus(result.value);
        else setError(errorMessage(result.error));
      })
      .catch(() => {
        if (alive.current) setError(t("settings.gitLabConnection.loadFailed"));
      });

    return () => {
      alive.current = false;
      if (current.current) void window.eda.gitlab.cancel(profileId, current.current.id);
      current.current = null;
    };
  }, [profileId]);

  useEffect(() => {
    let active = true;
    setProfile(null);
    const accountId = status?.account?.id;

    if (accountId)
      void window.eda.gitlab
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

      try {
        const result = await window.eda.gitlab.poll(profileId, pending.id);
        if (!active || current.current?.id !== pending.id) return;

        if (!result.ok) {
          current.current = null;
          setPending(null);
          setError(errorMessage(result.error));
        } else if (result.value.state === "connected") {
          current.current = null;
          setPending(null);
          setStatus(result.value.status);
          if (compact) setExpanded(false);
        } else timer = setTimeout(() => void poll(), 1000);
      } catch {
        if (active) {
          void window.eda.gitlab.cancel(profileId, pending.id);
          current.current = null;
          setPending(null);
          setError(t("settings.gitLabConnection.signInFailed"));
        }
      }
    };

    timer = setTimeout(() => void poll(), 1000);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pending, profileId, compact]);

  const openBrowser = async (signIn: GitLabSignIn) => {
    try {
      const result = await window.eda.gitlab.openAuthorization(profileId, signIn.id);
      if (alive.current && current.current?.id === signIn.id && !result.ok)
        setError(errorMessage(result.error));
    } catch {
      if (alive.current) setError(t("settings.gitLabConnection.openFailed"));
    }
  };

  const begin = async () => {
    setBusy(true);
    setError(null);

    try {
      const result = await window.eda.gitlab.begin(profileId);

      if (!alive.current) {
        if (result.ok) void window.eda.gitlab.cancel(profileId, result.value.id);
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
      if (alive.current) setError(t("settings.gitLabConnection.signInFailed"));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  useEffect(() => {
    if (!connectRequested || !status) return;
    setConnectRequested(false);
    if (!connected && !busy && !pending && status.secureStorage) void begin();
  }, [connectRequested, status, connected, busy, pending]);

  const cancel = () => {
    if (current.current) void window.eda.gitlab.cancel(profileId, current.current.id);
    current.current = null;
    setPending(null);
    setError(null);
    setExpanded(false);
    setConnectRequested(false);
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);

    try {
      const result = await window.eda.gitlab.disconnect(profileId);
      if (!alive.current) return;

      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }

      setStatus((value) => value && { ...value, account: null });
      setExpanded(false);
      setConnectRequested(false);
    } catch {
      if (alive.current) setError(t("settings.gitLabConnection.disconnectFailed"));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const openProfile = async () => {
    try {
      const result = await window.eda.gitlab.openProfile(profileId);
      if (alive.current && !result.ok) setError(errorMessage(result.error));
    } catch {
      if (alive.current) setError(t("settings.gitLabConnection.openFailed"));
    }
  };

  const account = status?.account;
  const details = profile?.id === account?.id ? profile : null;
  const accountProfile = account ? (
    <ConnectionProfile
      login={account.login}
      name={details?.name}
      bio={details?.bio}
      location={details?.location}
      avatarDataUrl={details?.avatarDataUrl}
      hue={hue}
      connected={connected}
      profileLabel={t("settings.gitLabConnection.viewProfile", { login: account.login })}
      onOpenProfile={() => void openProfile()}
    />
  ) : null;

  return (
    <ServiceAccountCard
      provider="GitLab"
      compact={compact}
      open={expanded}
      onOpenChange={(open) => {
        setExpanded(open);
        setConnectRequested(open);
      }}
      completedLabel={connected ? t("settings.gitLabConnection.connected") : undefined}
      actionsPlacement={pending ? "body" : "header"}
      bodyOpen={!!pending || !!error || !!(status && !status.secureStorage)}
      summary={
        loading && status?.account ? (
          <ConnectionAccountSkeleton login={status.account.login} hue={hue} />
        ) : (
          accountProfile
        )
      }
      pendingLabel={
        (loading && compact) || busy || pending ? t("settings.gitLabConnection.waiting") : undefined
      }
      actions={
        pending ? (
          <>
            <Button
              size="sm"
              icon={<ExternalLink size={13} />}
              onClick={() => void openBrowser(pending)}
            >
              {t("settings.gitLabConnection.openGitLab")}
            </Button>

            <Button size="sm" variant="ghost" onClick={cancel}>
              {t("common.cancel")}
            </Button>
          </>
        ) : loading && !status?.account ? (
          <ConnectionActionSkeleton label={t("settings.gitLabConnection.signIn")} />
        ) : status ? (
          <>
            {!connected && (
              <Button
                size="sm"
                busy={busy}
                disabled={!status.secureStorage}
                onClick={() => void begin()}
              >
                {status.account
                  ? t("settings.gitLabConnection.reconnect")
                  : t("settings.gitLabConnection.signIn")}
              </Button>
            )}

            {status.account &&
              (compact ? (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>
                  {t("settings.gitLabConnection.disconnect")}
                </Button>
              ) : (
                <ActionsMenu
                  label={t("settings.connections.manage", { provider: "GitLab" })}
                  disabled={busy}
                  items={[
                    {
                      label: t("settings.gitLabConnection.disconnect"),
                      icon: <Unplug size={14} />,
                      danger: true,
                      onSelect: () => void disconnect(),
                    },
                  ]}
                />
              ))}
          </>
        ) : undefined
      }
    >
      {error && (
        <p role="alert" className="text-xs text-git-deleted">
          {error}
        </p>
      )}

      {pending && (
        <p className="text-xs text-text-secondary">
          {t("settings.gitLabConnection.authorizeInBrowser")}
        </p>
      )}

      {loading && compact ? (
        <ConnectionAccountSkeleton login={account?.login ?? ""} hue={hue} />
      ) : compact && !pending ? (
        accountProfile
      ) : null}

      {status && !status.secureStorage && (
        <p className="text-xs text-git-modified">{t("settings.gitLabConnection.unlockStorage")}</p>
      )}
    </ServiceAccountCard>
  );
}
