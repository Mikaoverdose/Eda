import type { GitErrorData } from "@shared/errors";
import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { TransportCredentials } from "@shared/integrations/remotes";
import type { PullStrategy } from "@shared/workflows/pull";
import { useEffect, useRef, useState } from "react";
import { ACTION_FEEDBACK } from "../../../motion";
import { useAppStore } from "../../../stores/app-store";
import { useRepositoryStore } from "../../../stores/repository-store";

export function useDirectPull(repositoryId: string) {
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
  const [authentication, setAuthentication] = useState<PullStrategy | null>(null);
  const [githubAuthentication, setGitHubAuthentication] = useState<PullStrategy | null>(null);
  const [githubAccessDenied, setGitHubAccessDenied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pull = async (override?: PullStrategy, credentials?: TransportCredentials) => {
    if (running.current) return;
    const identityId = useAppStore.getState().activeIdentity?.id;
    const current = () =>
      mounted.current &&
      useAppStore.getState().selectedRepositoryId === repositoryId &&
      useAppStore.getState().activeIdentity?.id === identityId;
    running.current = true;
    const minimumPending = new Promise<void>((resolve) =>
      setTimeout(resolve, ACTION_FEEDBACK.minimumPending),
    );
    setBusy(true);
    setError(null);
    setMessage(null);
    setAuthentication(null);
    setGitHubAuthentication(null);
    setGitHubAccessDenied(false);
    let strategy = override;

    const fail = async (failure: GitErrorData) => {
      if (!current()) return;
      if (
        (failure.kind === "github-auth-required" || failure.kind === "github-access-required") &&
        strategy
      ) {
        setGitHubAuthentication(strategy);
        setGitHubAccessDenied(failure.kind === "github-access-required");
        setError(errorMessage(failure));
        return;
      }
      if (failure.kind === "auth-failed" && strategy) {
        const result = await window.eda.remotes.inspect(repositoryId);
        if (!current()) return;
        if (result.ok) {
          const head = result.value.branches.find((branch) => branch.isHead);
          const remote = result.value.remotes.find((item) =>
            head?.upstream?.startsWith(`${item.name}/`),
          );
          if (remote?.fetchUrls.some((url) => url.startsWith("https://"))) {
            setAuthentication(strategy);
            setError(errorMessage(failure));
            return;
          }
        }
      }
      setError(errorMessage(failure));
    };

    try {
      if (!strategy) {
        const result = await window.eda.pull.preference(repositoryId);
        if (!current()) return;
        if (!result.ok) return await fail(result.error);
        strategy = result.value.value;
      }
      const prepared = await window.eda.pull.prepare({
        repositoryId,
        strategy,
        ...(credentials ? { credentials } : {}),
      });
      if (!current()) return;
      if (!prepared.ok) return await fail(prepared.error);
      if (prepared.value.blockedReason) {
        setError(prepared.value.blockedReason);
        return;
      }
      const result = await window.eda.pull.execute(repositoryId, prepared.value.token);
      if (!current()) return;
      if (result.ok) setMessage(result.value);
      else await fail(result.error);
    } catch {
      if (current()) setError(t("useDirectPull.couldNotCompletePullTryAgain"));
    } finally {
      await minimumPending;
      running.current = false;
      if (mounted.current) setBusy(false);
      if (current()) await useRepositoryStore.getState().syncFromDisk();
    }
  };

  return {
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
  };
}
