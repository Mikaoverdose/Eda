import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { ChevronDown, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { openSettings } from "../../commands/open-settings";
import {
  Button,
  Dialog,
  ErrorDialog,
  Field,
  Input,
  MenuItem,
  PopoverSurface,
} from "../../components/ui/index";
import { GitHubSignInDialog } from "../connections/GitHubSignInDialog";
import { useDirectFetch } from "./hooks/useDirectFetch";

export function DirectFetchActions({
  repositoryId,
  disabled,
  onBusyChange,
}: {
  repositoryId: string;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const action = useDirectFetch(repositoryId);
  const [menu, setMenu] = useState(false);
  const [showError, setShowError] = useState(false);
  const [auth, setAuth] = useState({ username: "", password: "" });
  const scope = useRef<HTMLDivElement>(null);
  const fetch = async (remote?: string | null, credentials?: typeof auth) => {
    onBusyChange(true);
    try {
      await action.fetch(remote, credentials);
    } finally {
      onBusyChange(false);
    }
  };
  const closeAuth = () => {
    action.setAuthentication(null);
    action.setError(null);
    setAuth({ username: "", password: "" });
  };
  return (
    <>
      <div ref={scope} className="relative flex items-center">
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || action.busy}
          busy={action.busy}
          feedback={action.error ? "error" : action.message ? "success" : "idle"}
          icon={<RefreshCw size={14} />}
          title={
            action.error
              ? t("directFetchActions.fetchFailedClickForDetails")
              : (action.message ?? t("directFetchActions.fetch"))
          }
          onClick={() => (action.error ? setShowError(true) : void fetch())}
        >
          {t("directFetchActions.fetch")}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={disabled || action.busy}
          aria-label={t("directFetchActions.fetchOptions")}
          aria-haspopup="menu"
          aria-expanded={menu}
          icon={<ChevronDown size={12} />}
          onClick={() => {
            setMenu(!menu);
            if (!menu)
              void window.eda.remotes.inspect(repositoryId).then((result) => {
                if (result.ok) action.setRemotes(result.value.remotes);
                else action.setError(errorMessage(result.error));
              });
          }}
        />
        {menu && (
          <PopoverSurface
            role="menu"
            aria-label={t("directFetchActions.fetchOptions")}
            interactionRef={scope}
            onClose={() => setMenu(false)}
            className="absolute left-0 top-full mt-2 w-56 p-1"
          >
            {action.remotes.map((remote) => (
              <MenuItem
                key={remote.name}
                onClick={() => {
                  setMenu(false);
                  void fetch(remote.name);
                }}
              >
                {t("directFetchActions.fetchRemote", { name: remote.name })}
              </MenuItem>
            ))}
            <MenuItem
              onClick={() => {
                setMenu(false);
                void fetch(null);
              }}
            >
              {t("directFetchActions.fetchAllRemotes")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenu(false);
                openSettings("repository-fetch");
              }}
            >
              {t("directFetchActions.fetchSettings")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenu(false);
                openSettings("repository-remotes");
              }}
            >
              {t("directFetchActions.manageRemotes")}
            </MenuItem>
          </PopoverSurface>
        )}
      </div>
      <span role="status" className="sr-only">
        {action.busy ? t("directFetchActions.fetching") : (action.error ?? action.message)}
      </span>
      {action.authentication && (
        <Dialog
          title={t("directFetchActions.hTtpsAuthentication")}
          description={t("directFetchActions.signInToFetchCredentialsAreUsedForThisActionOnly", {
            authentication: action.authentication,
          })}
          onClose={closeAuth}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!auth.username.trim() || !auth.password || action.busy) return;
              const credentials = auth;
              const remote = action.authentication!;
              setAuth({ username: "", password: "" });
              void fetch(remote, credentials);
            }}
          >
            {action.error && (
              <p role="alert" className="text-xs text-git-modified">
                {action.error}
              </p>
            )}
            <Field label={t("directFetchActions.username")}>
              {(field) => (
                <Input
                  {...field}
                  aria-label={t("directFetchActions.hTtpsUsername")}
                  autoComplete="off"
                  value={auth.username}
                  onChange={(event) => setAuth({ ...auth, username: event.target.value })}
                />
              )}
            </Field>
            <Field label={t("directFetchActions.accessToken")}>
              {(field) => (
                <Input
                  {...field}
                  aria-label={t("directFetchActions.hTtpsToken")}
                  type="password"
                  autoComplete="off"
                  value={auth.password}
                  onChange={(event) => setAuth({ ...auth, password: event.target.value })}
                />
              )}
            </Field>
            <Button type="submit" disabled={!auth.username.trim() || !auth.password || action.busy}>
              {t("directFetchActions.retryFetch")}
            </Button>
          </form>
        </Dialog>
      )}
      {action.githubAuthentication && (
        <GitHubSignInDialog
          accessDenied={action.githubAccessDenied}
          onClose={() => {
            action.setGitHubAuthentication(null);
            action.setError(null);
          }}
        />
      )}
      {showError && !action.authentication && !action.githubAuthentication && (
        <ErrorDialog
          onDismiss={() => {
            setShowError(false);
            action.setError(null);
          }}
        >
          {action.error}
        </ErrorDialog>
      )}
    </>
  );
}
