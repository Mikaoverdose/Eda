import { errorMessage, type GitErrorData } from "@shared/errors";
import { t } from "@shared/i18n";
import { isGitHubHttps } from "@shared/integrations/github";
import {
  preferredRemote,
  remoteForTrackingRef,
  type PushPreview,
  type PushRequest,
  type TransportCredentials,
} from "@shared/integrations/remotes";
import { useEffect, useRef, useState } from "react";
import { useRepositoryStore } from "../../../stores/repository-store";
import { useTransportOperation } from "./useTransportOperation";

export function useDirectPush(repositoryId: string, afterCommit: boolean) {
  const { busy, begin } = useTransportOperation(repositoryId);
  const [preview, setPreview] = useState<PushPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);

  const [credentials, setCredentials] = useState<TransportCredentials>({
    username: "",
    password: "",
  });

  const [needsAuth, setNeedsAuth] = useState(false);
  const [githubFailure, setGitHubFailure] = useState<"auth" | "access" | null>(null);
  const [githubRemote, setGitHubRemote] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  const handleFailure = (failure: GitErrorData) => {
    setError(errorMessage(failure));

    const github =
      failure.kind === "github-auth-required"
        ? "auth"
        : failure.kind === "github-access-required"
          ? "access"
          : null;

    setGitHubFailure(github);
    const authentication = failure.kind === "auth-failed" || github !== null;
    setNeedsAuth(authentication);
    if (authentication) setPreview(null);
  };

  const closeAuthentication = () => {
    setError(null);
    setShowError(false);
    setNeedsAuth(false);
    setGitHubFailure(null);
    setCredentials({ username: "", password: "" });
  };

  const runPush = async (mode: PushRequest["mode"], auth?: TransportCredentials) => {
    const operation = begin();
    if (!operation) return;
    const { current } = operation;
    setShowError(false);
    setError(null);
    setMessage(null);
    setGitHubFailure(null);
    setGitHubRemote(false);

    const fail = (failure: GitErrorData) => {
      if (!current()) return;
      handleFailure(failure);
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
      const targetRemote = preferredRemote(inspected.value);

      if (!targetRemote) {
        setError(t("directPush.noRemoteIsConfiguredAddOneInSettingsRepoThenRetry"));
        return;
      }

      const target = targetRemote.name;

      const destinations = targetRemote.pushUrls.length
        ? targetRemote.pushUrls
        : targetRemote.fetchUrls;

      setGitHubRemote(destinations.length === 1 && isGitHubHttps(destinations[0]!));

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
      if (prepared.value.url) setGitHubRemote(isGitHubHttps(prepared.value.url));

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
      await operation.finish();
    }
  };

  useEffect(() => {
    if (afterCommit && !started.current) {
      started.current = true;
      void runPush("normal");
    }
  }, [afterCommit]);

  const confirmLease = async () => {
    if (!preview) return;
    const operation = begin();
    if (!operation) return;
    const { current } = operation;
    setError(null);
    setGitHubFailure(null);

    try {
      const result = await window.eda.remotes.push(
        repositoryId,
        preview.token,
        credentials.password ? credentials : undefined,
      );

      if (!current()) return;

      if (!result.ok) {
        handleFailure(result.error);
        return;
      }

      setPreview(null);
      setMessage(result.value || t("directPush.pushCompleted"));
      await useRepositoryStore.getState().syncFromDisk();
    } catch {
      if (current()) setError(t("directPush.couldNotCompletePushTryAgain"));
    } finally {
      await operation.finish();
    }
  };

  return {
    busy,
    preview,
    setPreview,
    error,
    setError,
    showError,
    setShowError,
    credentials,
    setCredentials,
    needsAuth,
    setNeedsAuth,
    githubFailure,
    githubRemote,
    message,
    closeAuthentication,
    runPush,
    confirmLease,
  };
}
