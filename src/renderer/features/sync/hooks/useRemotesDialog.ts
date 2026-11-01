import type { Result } from "@shared/errors";
import { errorAction, errorMessage } from "@shared/errors";
import { t, type MessageKey } from "@shared/i18n";
import type {
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
  _afterCommit: boolean,
  initialTab?: RemoteTab,
) {
  const loadRevision = useRef(0);
  const contextRevision = useRef(0);
  const [state, setState] = useState<RemoteState>({ remotes: [], branches: [] });
  const [tab, setTab] = useState<RemoteTab>(initialTab ?? "push");
  const [remote, setRemote] = useState("");
  const [branch, setBranch] = useState("");
  const [destination, setDestination] = useState("");
  const [upstream, setUpstream] = useState("");
  const [publish, setPublish] = useState(true);
  const [mode, setMode] = useState<PushRequest["mode"]>("normal");
  const [refKind, setRefKind] = useState<"branch" | "tag">("branch");
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

    const head = result.value.branches.find((item) => item.isHead);
    const preferredRemote =
      result.value.remotes.find((item) => head?.upstream?.startsWith(`${item.name}/`)) ??
      result.value.remotes.find((item) => item.name === "origin") ??
      result.value.remotes[0];

    setRemote((old) =>
      result.value.remotes.some((item) => item.name === old) ? old : (preferredRemote?.name ?? ""),
    );

    const current = result.value.branches.find((item) => item.isHead)?.name ?? "";

    setBranch((old) => old || current);
    setDestination((old) => old || current);
  };

  useEffect(() => {
    void load();
    return () => {
      loadRevision.current++;
      contextRevision.current++;
    };
  }, [repositoryId]);

  const run = async <T>(
    kindKey: MessageKey,
    work: () => Promise<Result<T>>,
    done?: (value: T) => void,
  ) => {
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

      if (useRepositoryStore.getState().repositoryId === repositoryId)
        await useRepositoryStore.getState().syncFromDisk();
    } finally {
      if (context === contextRevision.current) setBusy(null);
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
