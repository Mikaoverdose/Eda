import type { GitErrorData } from "@shared/errors";
import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { remoteForTrackingRef, type TransportCredentials } from "@shared/integrations/remotes";
import type { PullStrategy } from "@shared/workflows/pull";
import { useState } from "react";
import { useRepositoryStore } from "../../../stores/repository-store";
import { useTransportOperation } from "./useTransportOperation";

export function useDirectPull(repositoryId: string) {
  const { busy, begin } = useTransportOperation(repositoryId);
  const [error, setError] = useState<string | null>(null);
  const [authentication, setAuthentication] = useState<PullStrategy | null>(null);
  const [githubAuthentication, setGitHubAuthentication] = useState<PullStrategy | null>(null);
  const [githubAccessDenied, setGitHubAccessDenied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pull = async (override?: PullStrategy, credentials?: TransportCredentials) => {
    const operation = begin();
    if (!operation) return;
    const { current } = operation;
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
          const remote = remoteForTrackingRef(result.value.remotes, head?.upstream);
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
      await operation.finish();
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
