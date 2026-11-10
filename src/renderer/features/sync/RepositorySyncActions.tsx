import { HttpsAuthenticationDialog } from "./HttpsAuthenticationDialog";
import { t } from "@shared/i18n";
import { DirectFetchActions } from "./DirectFetchActions";
import { useRef, useState } from "react";
import { ArrowDown, ChevronDown } from "lucide-react";
import { useAppStore } from "../../stores/app-store";
import { useRepositoryStore } from "../../stores/repository-store";
import { Button, MenuItem, AnchoredPopover, ErrorDialog } from "../../components/ui/index";
import { useDirectPull } from "./hooks/useDirectPull";
import { DirectPush } from "./DirectPush";
import { GitHubSignInDialog } from "../connections/GitHubSignInDialog";

export function RepositorySyncActions() {
  const repositoryId = useAppStore((state) => state.selectedRepositoryId);
  const identityId = useAppStore((state) => state.activeIdentity?.id);

  const ready = useRepositoryStore(
    (state) =>
      state.repositoryId === repositoryId &&
      state.identityId === identityId &&
      state.phase === "ready",
  );

  if (!repositoryId || !identityId) return null;

  return (
    <SyncActions
      key={`${identityId}:${repositoryId}`}
      repositoryId={repositoryId}
      disabled={!ready}
    />
  );
}

function SyncActions({ repositoryId, disabled }: { repositoryId: string; disabled: boolean }) {
  const [menu, setMenu] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  const {
    pull,
    busy,
    error,
    setError,
    authentication,
    setAuthentication,
    githubAuthentication,
    githubAccessDenied,
    setGitHubAuthentication,
    message,
  } = useDirectPull(repositoryId);

  const [showError, setShowError] = useState(false);
  const writing = useRepositoryStore((state) => state.writing);
  const [fetching, setFetching] = useState(false);
  const unavailable = disabled || busy || writing || fetching;

  return (
    <>
      <div
        role="group"
        aria-label={t("repositorySyncActions.repositorySync")}
        className="flex shrink-0 items-center gap-1"
      >
        <DirectFetchActions
          repositoryId={repositoryId}
          disabled={disabled || busy || writing}
          onBusyChange={setFetching}
        />

        <div className="relative flex items-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={unavailable}
            busy={busy}
            feedback={error ? "error" : message ? "success" : "idle"}
            icon={<ArrowDown size={14} />}
            title={
              error
                ? t("repositorySyncActions.pullFailedClickForDetails")
                : (message ?? t("repositorySyncActions.pull"))
            }
            onClick={() => (error ? setShowError(true) : void pull())}
          >
            {t("repositorySyncActions.pull")}
          </Button>

          <Button
            variant="ghost"
            size="icon-xs"
            ref={trigger}
            disabled={unavailable}
            aria-label={t("repositorySyncActions.pullStrategies")}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
            icon={<ChevronDown size={12} />}
          />

          {menu && (
            <AnchoredPopover
              role="menu"
              aria-label={t("repositorySyncActions.pullStrategies")}
              anchorRef={trigger}
              placement="bottom-start"
              onClose={() => setMenu(false)}
              className="w-72 p-1"
            >
              {(
                [
                  ["ff", t("repositorySyncActions.fastForwardIfPossibleOtherwiseMerge")],
                  ["ff-only", t("repositorySyncActions.fastForwardOnly")],
                  ["rebase", t("repositorySyncActions.rebaseLocalCommits")],
                ] as const
              ).map(([strategy, label]) => (
                <MenuItem
                  key={strategy}
                  onClick={() => {
                    setMenu(false);
                    void pull(strategy);
                  }}
                >
                  {label}
                </MenuItem>
              ))}
            </AnchoredPopover>
          )}
        </div>

        <DirectPush repositoryId={repositoryId} disabled={unavailable} />
      </div>

      <span role="status" className="sr-only">
        {busy ? t("repositorySyncActions.pulling") : (error ?? message)}
      </span>

      {authentication && (
        <HttpsAuthenticationDialog
          key={authentication}
          title={t("repositorySyncActions.hTtpsAuthentication")}
          description={t(
            "repositorySyncActions.signInWithYourGitUsernameAndAccessTokenCredentialsArenTSaved",
          )}
          submitLabel={t("repositorySyncActions.retryPull")}
          busy={busy}
          error={error}
          onClose={() => {
            setAuthentication(null);
            setError(null);
          }}
          onSubmit={(credentials) => void pull(authentication, credentials)}
        />
      )}

      {githubAuthentication && (
        <GitHubSignInDialog
          accessDenied={githubAccessDenied}
          onClose={() => {
            setGitHubAuthentication(null);
            setError(null);
          }}
        />
      )}

      {showError && !authentication && !githubAuthentication && (
        <ErrorDialog
          onDismiss={() => {
            setShowError(false);
            setError(null);
          }}
        >
          {error}
        </ErrorDialog>
      )}
    </>
  );
}
