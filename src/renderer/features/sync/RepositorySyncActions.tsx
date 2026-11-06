import { CredentialFields } from "./TransportFields";
import { t } from "@shared/i18n";
import { DirectFetchActions } from "./DirectFetchActions";
import { useId, useRef, useState } from "react";
import { ArrowDown, ChevronDown } from "lucide-react";
import { useAppStore } from "../../stores/app-store";
import { useRepositoryStore } from "../../stores/repository-store";
import { Button, MenuItem, PopoverSurface, Dialog, ErrorDialog } from "../../components/ui/index";
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
  const scope = useRef<HTMLDivElement>(null);
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
  const authenticationForm = useId();
  const [auth, setAuth] = useState({ username: "", password: "" });
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
        <div ref={scope} className="relative flex items-center">
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
            disabled={unavailable}
            aria-label={t("repositorySyncActions.pullStrategies")}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
            icon={<ChevronDown size={12} />}
          />
          {menu && (
            <PopoverSurface
              role="menu"
              aria-label={t("repositorySyncActions.pullStrategies")}
              interactionRef={scope}
              onClose={() => setMenu(false)}
              className="absolute left-0 top-full mt-2 w-72 p-1"
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
            </PopoverSurface>
          )}
        </div>
        <DirectPush repositoryId={repositoryId} disabled={unavailable} />
      </div>
      <span role="status" className="sr-only">
        {busy ? t("repositorySyncActions.pulling") : (error ?? message)}
      </span>
      {authentication && (
        <Dialog
          title={t("repositorySyncActions.hTtpsAuthentication")}
          description={t(
            "repositorySyncActions.signInWithYourGitUsernameAndAccessTokenCredentialsArenTSaved",
          )}
          onClose={() => {
            setAuthentication(null);
            setError(null);
            setAuth({ username: "", password: "" });
          }}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setAuthentication(null);
                  setError(null);
                  setAuth({ username: "", password: "" });
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                type="submit"
                form={authenticationForm}
                disabled={!auth.username.trim() || !auth.password || busy}
              >
                {t("repositorySyncActions.retryPull")}
              </Button>
            </>
          }
        >
          <form
            id={authenticationForm}
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!auth.username.trim() || !auth.password || busy) return;
              const credentials = auth;
              setAuth({ username: "", password: "" });
              void pull(authentication, credentials);
            }}
          >
            {error && (
              <p
                role="alert"
                className="rounded-md border border-git-deleted/25 bg-git-deleted/5 px-3 py-2.5 text-xs leading-relaxed text-git-deleted"
              >
                {error}
              </p>
            )}
            <CredentialFields value={auth} onChange={setAuth} disabled={busy} />
          </form>
        </Dialog>
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
