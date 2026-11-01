import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import {
  preferredRemote,
  type RemoteSummary,
  type TransportCredentials,
} from "@shared/integrations/remotes";
import { useEffect, useRef, useState } from "react";
import { ACTION_FEEDBACK } from "../../../motion";
import { useAppStore } from "../../../stores/app-store";
import { useRepositoryStore } from "../../../stores/repository-store";

export function useDirectFetch(repositoryId: string) {
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [authentication, setAuthentication] = useState<string | null>(null);
  const [githubAuthentication, setGitHubAuthentication] = useState<string | null>(null);
  const [githubAccessDenied, setGitHubAccessDenied] = useState(false);
  const [remotes, setRemotes] = useState<RemoteSummary[]>([]);

  const fetch = async (target?: string | null, credentials?: TransportCredentials) => {
    if (running.current) return;
    const profileId = useAppStore.getState().activeIdentity?.id;
    const current = () =>
      mounted.current &&
      useAppStore.getState().selectedRepositoryId === repositoryId &&
      useAppStore.getState().activeIdentity?.id === profileId;
    if (!current() || !profileId) return;
    running.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    setAuthentication(null);
    setGitHubAuthentication(null);
    setGitHubAccessDenied(false);
    const minimumPending = new Promise<void>((resolve) =>
      setTimeout(resolve, ACTION_FEEDBACK.minimumPending),
    );
    try {
      const context = { profileId, repositoryId };
      const [inspected, prune, tags] = await Promise.all([
        window.eda.remotes.inspect(repositoryId),
        window.eda.settings.resolve("fetchPrune", context),
        window.eda.settings.resolve("fetchTags", context),
      ]);
      if (!current()) return;
      if (!inspected.ok) {
        setError(errorMessage(inspected.error));
        return;
      }
      if (!prune.ok) {
        setError(errorMessage(prune.error));
        return;
      }
      if (!tags.ok) {
        setError(errorMessage(tags.error));
        return;
      }
      setRemotes(inspected.value.remotes);
      const preferred = preferredRemote(inspected.value);
      const remote = target === undefined ? preferred?.name : target;
      if (remote === undefined || !inspected.value.remotes.length) {
        setError(t("useDirectFetch.noRemotesConfiguredAddARemoteInThe"));
        return;
      }
      if (remote !== null && !inspected.value.remotes.some((item) => item.name === remote)) {
        setError(t("useDirectFetch.thisRemoteNoLongerExistsChooseAnotherRemote"));
        return;
      }
      const destinations =
        remote === null
          ? inspected.value.remotes
          : inspected.value.remotes.filter((item) => item.name === remote);
      for (const destination of destinations) {
        if (!current()) return;
        const result = await window.eda.remotes.fetch({
          repositoryId,
          remote: destination.name,
          prune: prune.value.value,
          tags: tags.value.value,
          ...(credentials ? { credentials } : {}),
        });
        if (!current()) return;
        if (!result.ok) {
          setError(errorMessage(result.error));
          if (
            result.error.kind === "github-auth-required" ||
            result.error.kind === "github-access-required"
          ) {
            setGitHubAuthentication(destination.name);
            setGitHubAccessDenied(result.error.kind === "github-access-required");
          }
          if (
            result.error.kind === "auth-failed" &&
            destination.fetchUrls.some((url) => url.startsWith("https://"))
          )
            setAuthentication(destination.name);
          return;
        }
      }
      setMessage(
        remote === null
          ? t("useDirectFetch.fetchedAllRemotes")
          : t("useDirectFetch.fetched", { remote: remote }),
      );
    } catch {
      if (current()) setError(t("useDirectFetch.couldNotCompleteFetchTryAgain"));
    } finally {
      await minimumPending;
      running.current = false;
      if (mounted.current) setBusy(false);
      if (current()) await useRepositoryStore.getState().syncFromDisk();
    }
  };
  return {
    fetch,
    busy,
    error,
    setError,
    message,
    authentication,
    setAuthentication,
    githubAuthentication,
    githubAccessDenied,
    setGitHubAuthentication,
    remotes,
    setRemotes,
  };
}
