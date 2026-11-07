import type { Result } from "@shared/errors";
import { errorAction, errorMessage } from "@shared/errors";
import { t, type MessageKey } from "@shared/i18n";
import { preferredRemote } from "@shared/integrations/remotes";
import type {
  RemoteRefKind,
  PushPreview,
  PushRequest,
  RemoteChange,
  RemoteState,
  TransportCredentials,
} from "@shared/integrations/remotes";
import { useEffect, useRef, useState } from "react";
import { useRepositoryStore } from "../../../stores/repository-store";
import type { RejectedPush } from "../RejectedPushNotice";

export type RemoteTab = "push" | "tracking" | "configure";

export function useRemotesDialog(
  repositoryId: string,
  initialTab?: RemoteTab,
  initialTag?: string,
  initialRemote?: string,
) {
  const loadRevision = useRef(0);
  const running = useRef(false);
  const mounted = useRef(false);
  const contextRevision = useRef(0);
  const [state, setState] = useState<RemoteState>({ remotes: [], branches: [] });
  const [tab, setTab] = useState<RemoteTab>(initialTab ?? "push");
  const [remote, setRemote] = useState("");
  const [branch, setBranch] = useState("");
  const [destination, setDestination] = useState("");
  const [upstream, setUpstream] = useState("");
  const [publish, setPublish] = useState(true);
  const [mode, setMode] = useState<PushRequest["mode"]>("normal");
  const [refKind, setRefKind] = useState<RemoteRefKind>("branch");
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<PushPreview | null>(null);
  const [edit, setEdit] = useState<RemoteChange>({ kind: "add", name: "origin", url: "" });
  const [remove, setRemove] = useState<string | null>(null);
  const [auth, setAuth] = useState<TransportCredentials>({ username: "", password: "" });
  const [busy, setBusy] = useState<MessageKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectedPush, setRejectedPush] = useState<RejectedPush | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = async () => {
    const revision = ++loadRevision.current;
    try {
      const result = await window.eda.remotes.inspect(repositoryId);

      if (revision !== loadRevision.current) return;

      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }

      setState(result.value);

      const tagResult = await window.eda.repository.listTags(repositoryId);

      if (revision !== loadRevision.current) return;
      if (tagResult.ok) setTagNames(tagResult.value.map((tag) => tag.name));

      const preferred = preferredRemote(result.value);

      setRemote((old) =>
        result.value.remotes.some((item) => item.name === old)
          ? old
          : result.value.remotes.some((item) => item.name === initialRemote)
            ? initialRemote!
            : (preferred?.name ?? ""),
      );

      const current = result.value.branches.find((item) => item.isHead)?.name ?? "";

      setBranch((old) => old || initialTag || current);
      setDestination((old) => old || initialTag || current);
    } catch (error) {
      if (revision === loadRevision.current) setError(errorMessage(error));
    }
  };

  useEffect(() => {
    mounted.current = true;
    running.current = false;
    setBusy(null);
    setState({ remotes: [], branches: [] });
    setRemote("");
    setBranch("");
    setDestination("");
    setUpstream("");
    setTagNames([]);
    setPublish(true);
    setMode("normal");
    setRefKind(initialTag ? "tag" : "branch");
    setTab(initialTab ?? "push");
    setPreview(null);
    setAuth({ username: "", password: "" });
    setEdit({ kind: "add", name: "origin", url: "" });
    setRemove(null);
    setConfirmation("");
    setError(null);
    setMessage(null);
    setRejectedPush(null);
    void load();
    return () => {
      mounted.current = false;
      loadRevision.current++;
      contextRevision.current++;
    };
  }, [repositoryId, initialTag, initialRemote]);

  const run = async <T>(
    kindKey: MessageKey,
    work: () => Promise<Result<T>>,
    done?: (value: T) => void,
  ) => {
    if (!mounted.current || running.current) return;
    running.current = true;
    const context = contextRevision.current;

    setBusy(kindKey);
    setError(null);
    setRejectedPush(null);
    setMessage(null);

    try {
      const result = await work();

      if (context !== contextRevision.current) return;

      if (!result.ok) {
        setError(`${errorMessage(result.error)} ${errorAction(result.error) ?? ""}`);
        if (tab === "push" && result.error.kind === "non-fast-forward")
          setRejectedPush({ branch, remote, destination, refKind });
      } else {
        done?.(result.value);
        if (!done)
          setMessage(
            typeof result.value === "string" ? result.value : t("remotes.useRemotesDialog.saved"),
          );
      }

      await load();

      if (context !== contextRevision.current) return;
      if (useRepositoryStore.getState().repositoryId === repositoryId)
        await useRepositoryStore.getState().syncFromDisk();
    } catch (error) {
      if (context === contextRevision.current) setError(errorMessage(error));
    } finally {
      if (context === contextRevision.current) {
        running.current = false;
        setBusy(null);
      }
    }
  };

  const credentials = auth.username || auth.password ? { credentials: auth } : {};
  const selectedRemote = state.remotes.find((item) => item.name === remote);
  const selectedBranch = state.branches.find((item) => !item.remote && item.name === branch);

  return {
    state,
    tab,
    setTab,
    remote,
    setRemote,
    branch,
    setBranch,
    destination,
    setDestination,
    upstream,
    setUpstream,
    publish,
    setPublish,
    mode,
    setMode,
    refKind,
    setRefKind,
    tagNames,
    confirmation,
    setConfirmation,
    preview,
    setPreview,
    edit,
    setEdit,
    remove,
    setRemove,
    auth,
    setAuth,
    busy,
    error,
    setError,
    rejectedPush,
    setRejectedPush,
    message,
    setMessage,
    run,
    credentials,
    selectedRemote,
    selectedBranch,
  };
}
