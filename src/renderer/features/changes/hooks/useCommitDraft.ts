import { categorizeChanges } from "../../../repository/working-changes";
import { emptyDraft } from "@shared/identity/profile-session";
import { matchCommitPrefix } from "@shared/preferences/commit-prefix";
import { useState, type KeyboardEvent } from "react";
import { useAppStore } from "../../../stores/app-store";
import { usePreferencesStore } from "../../../stores/preferences-store";
import { useRepositoryStore } from "../../../stores/repository-store";
import { useSessionStore } from "../../../stores/session-store";

export function useCommitDraft(pending: boolean) {
  const conventional = usePreferencesStore(
    (state) => state.values.conventionalCommitsEnabled.value,
  );

  const prefixes = usePreferencesStore((state) => state.values.commitPrefixes.value);
  const status = useRepositoryStore((state) => state.status);
  const writing = useRepositoryStore((state) => state.writing);
  const commit = useRepositoryStore((state) => state.commit);
  const repositoryId = useRepositoryStore((state) => state.repositoryId);
  const [pushRequest, setPushRequest] = useState(0);
  const snapshot = useSessionStore((state) => state.snapshot);
  const transitioning = useSessionStore((state) => state.transitioning);
  const selectedId = useAppStore((state) => state.selectedRepositoryId);
  const draft = (selectedId && snapshot?.drafts[selectedId]) || emptyDraft();
  const { message, amend } = draft;
  const firstBreak = message.indexOf("\n");
  const title = firstBreak < 0 ? message : message.slice(0, firstBreak).replace(/\r$/, "");
  const recognized = conventional ? matchCommitPrefix(title, prefixes) : null;
  const selectedPrefix = recognized?.[1] ?? "";
  const subject = recognized ? title.slice(recognized[0].length) : title;

  const composeTitle = (value: string) => {
    const typed = conventional ? matchCommitPrefix(value, prefixes) : null;
    if (typed)
      return `${typed[1]}${typed[2] ?? ""}${typed[3] ?? ""}: ${value.slice(typed[0].length)}`;

    return selectedPrefix
      ? `${selectedPrefix}${recognized?.[2] ?? ""}${recognized?.[3] ?? ""}: ${value}`
      : value;
  };

  const messageTail = firstBreak < 0 ? "" : message.slice(firstBreak);
  const description = messageTail.replace(/^\r?\n(?:\r?\n)?/, "");

  const setMessage = (message: string) => {
    if (!pending && repositoryId)
      useSessionStore.getState().setDraft(repositoryId, { ...draft, message });
  };

  const setAmend = (amend: boolean) => {
    if (!pending && repositoryId)
      useSessionStore.getState().setDraft(repositoryId, { ...draft, amend });
  };

  const staged = categorizeChanges(status?.changes ?? []).staged.length;

  const canCommit =
    !pending &&
    subject.trim().length > 0 &&
    (staged > 0 || amend) &&
    !writing &&
    status?.capabilities?.write !== false &&
    !transitioning &&
    !snapshot?.recovery;

  const submit = async (push = false) => {
    if (!canCommit || !repositoryId) return;

    const owner = snapshot?.context.profileId;
    const sessionContext = snapshot?.context;
    const repositoryGeneration = useRepositoryStore.getState().generation;
    const revisionKey = `${owner}:${repositoryId}`;
    const revision = useSessionStore.getState().draftRevisions[revisionKey];

    if (!(await useSessionStore.getState().flush())) return;

    const session = useSessionStore.getState();
    const repository = useRepositoryStore.getState();

    if (
      session.transitioning ||
      session.snapshot?.context.profileId !== owner ||
      session.snapshot?.context.generation !== sessionContext?.generation ||
      session.snapshot?.context.windowId !== sessionContext?.windowId ||
      useAppStore.getState().selectedRepositoryId !== repositoryId ||
      repository.repositoryId !== repositoryId ||
      repository.generation !== repositoryGeneration ||
      repository.writing
    )
      return;

    const committed = await commit(message, { amend, signOff: draft.signOff ?? false });

    if (committed) {
      const current = useSessionStore.getState();
      const latest = current.snapshot?.drafts[repositoryId];

      if (
        current.snapshot?.context.profileId === owner &&
        current.draftRevisions[revisionKey] === revision &&
        latest?.message === message &&
        latest.amend === amend
      )
        current.setDraft(repositoryId, emptyDraft());

      if (
        push &&
        current.snapshot?.context.profileId === owner &&
        useRepositoryStore.getState().repositoryId === repositoryId
      )
        setPushRequest((previous) => previous + 1);
    }
  };

  const commitShortcut = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    }
  };

  return {
    snapshot,
    transitioning,
    draft,
    message,
    amend,
    title,
    recognized,
    selectedPrefix,
    subject,
    composeTitle,
    messageTail,
    description,
    setMessage,
    setAmend,
    staged,
    canCommit,
    submit,
    commitShortcut,
    conventional,
    prefixes,
    pushRequest,
  };
}
