import { errorAction, errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { emptyDraft } from "@shared/identity/profile-session";
import { matchCommitPrefix } from "@shared/preferences/commit-prefix";
import type { CommitPreview } from "@shared/repository/repository-write";
import { KeyRound, ShieldOff } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { Skeleton } from "../../components/ui/feedback/Skeleton";
import {
  Button,
  Checkbox,
  Dialog,
  Disclosure,
  ErrorDialog,
  IdentityIcon,
  Input,
  Textarea,
  TextButton,
} from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";
import { usePreferencesStore } from "../../stores/preferences-store";
import { categorizeChanges, useRepositoryStore } from "../../stores/repository-store";
import { useSessionStore } from "../../stores/session-store";
import { DirectPush } from "../sync/DirectPush";
import { CommitPrefixPicker } from "./CommitPrefixPicker";

export function CommitBox({ pending = false }: { pending?: boolean }) {
  const conventional = usePreferencesStore(
    (state) => state.values.conventionalCommitsEnabled.value,
  );
  const prefixes = usePreferencesStore((state) => state.values.commitPrefixes.value);
  const [expanded, setExpanded] = useState(true);
  const [pushRequest, setPushRequest] = useState(0);
  const [coauthorOpen, setCoauthorOpen] = useState(false);
  const [coauthorName, setCoauthorName] = useState("");
  const [coauthorEmail, setCoauthorEmail] = useState("");
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const identity = useAppStore((state) => state.activeIdentity);
  const preferences = usePreferencesStore((state) => state.values);
  const status = useRepositoryStore((state) => state.status);
  const writing = useRepositoryStore((state) => state.writing);
  const writeError = useRepositoryStore((state) => state.writeError);
  const commitNotice = useRepositoryStore((state) => state.commitNotice);
  const commit = useRepositoryStore((state) => state.commit);
  const repositoryId = useRepositoryStore((state) => state.repositoryId);
  const [preview, setPreview] = useState<CommitPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    setPreview(null);
    setPreviewError(null);

    if (!pending && repositoryId)
      void window.eda.repository.previewCommit(repositoryId).then((result) => {
        if (!alive) return;
        if (result.ok) setPreview(result.value);
        else setPreviewError(errorMessage(result.error));
      });

    return () => {
      alive = false;
    };
  }, [repositoryId, identity, status, pending, preferences]);

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

  return (
    <section
      data-tour="commit-box"
      className="app-surface-panel flex shrink-0 flex-col gap-3 border-t border-border-default p-3"
    >
      <Disclosure
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
        title={
          <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-text-primary">{t("commitBox.commit")}</h3>
            <span className="mono text-xs text-text-tertiary">
              {pending ? (
                <Skeleton className="w-20" />
              ) : staged === 0 ? (
                t("commitBox.nothingStaged")
              ) : (
                t("commitBox.staged", { staged: staged })
              )}
              {!pending && preview && staged > 0 && (
                <>
                  {", "}
                  <span className="text-git-added">+{preview.additions}</span>{" "}
                  <span className="text-git-deleted">-{preview.deletions}</span>
                  {preview.binaryFiles > 0 &&
                    t("commitBox.binary", { binaryFiles: preview.binaryFiles })}
                </>
              )}
            </span>
          </div>
        }
      >
        <div className="flex flex-col gap-3 pt-3">
          <div className="space-y-2">
            <div className="flex min-w-0 items-center gap-2">
              {conventional && (
                <CommitPrefixPicker
                  key={`${snapshot?.context.profileId}:${repositoryId}`}
                  value={selectedPrefix}
                  prefixes={prefixes}
                  disabled={pending || !!snapshot?.recovery || transitioning}
                  onChange={(prefix) =>
                    setMessage(
                      `${prefix ? `${prefix}${recognized?.[2] ?? ""}${recognized?.[3] ?? ""}: ` : ""}${subject}${messageTail}`,
                    )
                  }
                />
              )}
              <div className="min-w-0 flex-1">
                <Input
                  value={subject}
                  onChange={(event) =>
                    setMessage(`${composeTitle(event.target.value)}${messageTail}`)
                  }
                  onPaste={(event) => {
                    const text = event.clipboardData.getData("text/plain");

                    if (!/[\r\n]/.test(text)) return;

                    event.preventDefault();

                    const field = event.currentTarget;

                    setMessage(
                      `${composeTitle(`${subject.slice(0, field.selectionStart ?? subject.length)}${text.replace(/\r\n?/g, "\n")}${subject.slice(field.selectionEnd ?? subject.length)}`)}${messageTail}`,
                    );
                  }}
                  onKeyDown={commitShortcut}
                  placeholder={t("commitBox.commitTitle")}
                  aria-label={t("commitBox.commitTitle")}
                  disabled={pending || !!snapshot?.recovery || transitioning}
                />
              </div>
            </div>
            <Textarea
              rows={3}
              value={description}
              onChange={(event) =>
                setMessage(event.target.value ? `${title}\n\n${event.target.value}` : title)
              }
              onKeyDown={commitShortcut}
              placeholder={t("commitBox.descriptionOptional")}
              aria-label={t("commitBox.commitDescription")}
              disabled={pending || !!snapshot?.recovery || transitioning}
              surface="base"
              className="resize-none leading-relaxed"
            />
          </div>

          <Checkbox
            className="flex items-center gap-1.5 text-xs text-text-secondary"
            checked={amend}
            disabled={pending || !!snapshot?.recovery || transitioning}
            onChange={(event) => setAmend(event.target.checked)}
          >
            {t("commitBox.amendThePreviousCommit")}
          </Checkbox>
          {amend && (
            <p className="text-xs text-git-modified">
              {t("commitBox.amendReplacesTheLatestCommitIdIfThat", {
                value1: preview?.sharedRefs.length
                  ? t("commitBox.headIsContainedIn", { sharedRefs: preview.sharedRefs.join(", ") })
                  : t("commitBox.remoteTrackingRefsDoNotProveWhetherThisCommitHasBeenShared"),
              })}
            </p>
          )}
          <Disclosure title={t("commitBox.commitOptions")} className="text-xs">
            <div className="mt-2 space-y-2">
              <Checkbox
                checked={draft.signOff ?? false}
                disabled={writing || transitioning}
                onChange={(event) => {
                  if (repositoryId)
                    useSessionStore
                      .getState()
                      .setDraft(repositoryId, { ...draft, signOff: event.target.checked });
                }}
              >
                {t("commitBox.addSignedOffByTrailer")}
              </Checkbox>
              <div className="flex gap-3">
                <TextButton
                  disabled={writing || transitioning}
                  onClick={() => setCoauthorOpen(true)}
                >
                  {t("commitBox.addCoAuthor")}
                </TextButton>
                <TextButton
                  disabled={writing || transitioning}
                  onClick={() => {
                    if (!repositoryId) return;

                    const owner = snapshot?.context.profileId;
                    const currentMessage = message;

                    void window.eda.repository.commitTemplate(repositoryId).then((result) => {
                      const current = useSessionStore.getState();

                      if (
                        current.snapshot?.context.profileId !== owner ||
                        current.snapshot?.session.selectedRepositoryId !== repositoryId
                      )
                        return;

                      if (!result.ok) setTemplateMessage(errorMessage(result.error));
                      else if (!result.value)
                        setTemplateMessage(
                          t("commitBox.noCommitTemplateIsConfiguredForThisRepository"),
                        );
                      else if (
                        (current.snapshot.drafts[repositoryId]?.message ?? "") !== currentMessage
                      )
                        setTemplateMessage(
                          t("commitBox.theDraftChangedWhileLoadingInsertTheTemplateAgain"),
                        );
                      else {
                        setMessage(
                          currentMessage ? `${currentMessage}\n\n${result.value}` : result.value,
                        );
                        setTemplateMessage(null);
                      }
                    });
                  }}
                >
                  {t("commitBox.insertGitTemplate")}
                </TextButton>
              </div>
              {templateMessage && <p role="status">{templateMessage}</p>}
            </div>
          </Disclosure>
          {coauthorOpen && (
            <Dialog
              title={t("commitBox.coAuthorDialogTitle")}
              onClose={() => setCoauthorOpen(false)}
              footer={
                <Button
                  disabled={
                    !coauthorName.trim() ||
                    /[<>\r\n]/.test(coauthorName) ||
                    !/^[^\s<>@]+@[^\s<>@]+$/.test(coauthorEmail)
                  }
                  onClick={() => {
                    setMessage(
                      `${message.trimEnd()}

Co-authored-by: ${coauthorName.trim()} <${coauthorEmail.trim()}>`,
                    );
                    setCoauthorOpen(false);
                  }}
                >
                  {t("commitBox.insertTrailer")}
                </Button>
              }
            >
              <div className="space-y-3">
                <Input
                  aria-label={t("commitBox.coAuthorName")}
                  placeholder={t("common.name")}
                  value={coauthorName}
                  onChange={(event) => setCoauthorName(event.target.value)}
                />
                <Input
                  aria-label={t("commitBox.coAuthorEmail")}
                  type="email"
                  placeholder={t("common.email")}
                  value={coauthorEmail}
                  onChange={(event) => setCoauthorEmail(event.target.value)}
                />
              </div>
            </Dialog>
          )}

          <div className="flex min-w-0 items-center gap-3 text-xs text-text-tertiary">
            {preview ? (
              <span
                className="flex min-w-0 items-center gap-1.5"
                title={`${preview.author.name} <${preview.author.email}>`}
                tabIndex={0}
                aria-label={t("commitBox.commitIdentity", {
                  name: preview.author.name,
                  email: preview.author.email,
                })}
              >
                <IdentityIcon size={14} aria-hidden="true" />
                <span className="truncate">{preview.author.name}</span>
              </span>
            ) : (
              <Skeleton className="w-20" />
            )}
            {preview && (
              <span
                className="ml-auto flex shrink-0 items-center gap-1.5"
                title={preview.signing}
                tabIndex={0}
                aria-label={t("commitBox.commitSigning", { signing: preview.signing })}
              >
                {!preview.signingEnabled ? (
                  <ShieldOff size={14} aria-hidden="true" />
                ) : (
                  <KeyRound size={14} aria-hidden="true" />
                )}
                <span>{preview.signing.split(", ")[0]}</span>
              </span>
            )}
          </div>
          {previewError && (
            <ErrorDialog title={t("commitBox.commitPreviewUnavailable")}>
              {previewError}
            </ErrorDialog>
          )}

          {writeError && (
            <ErrorDialog>
              {errorMessage(writeError)}
              {errorAction(writeError) && (
                <span className="mt-0.5 block text-text-tertiary">{errorAction(writeError)}</span>
              )}
            </ErrorDialog>
          )}
          {commitNotice && (
            <p role="status" className="text-xs text-git-modified">
              {commitNotice}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={!canCommit}
              busy={writing}
              title={t("commitBox.commitCtrlEnter")}
              onClick={() => void submit()}
            >
              {amend ? t("commitBox.amendCommit") : t("commitBox.commit")}
            </Button>
            <Button
              size="sm"
              disabled={!canCommit || !status?.branch || status.branch.detached}
              onClick={() => void submit(true)}
              title={t("commitBox.commitLocallyThenPushToTheCurrentBranchSUpstream")}
            >
              {amend ? t("commitBox.amendAndPush") : t("commitBox.commitAndPush")}
            </Button>
          </div>
          {pushRequest > 0 && repositoryId && (
            <DirectPush key={pushRequest} repositoryId={repositoryId} afterCommit />
          )}
        </div>
      </Disclosure>
    </section>
  );
}
