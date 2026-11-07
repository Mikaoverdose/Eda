import { ERROR_CODE, errorText } from "@shared/error-codes";
import { referenceLink } from "@shared/repository/reference-link";
import type { Result } from "@shared/errors";
import { AppError, errorAction, errorMessage, GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import type {
  BranchSummary,
  TagSummary,
  TagVerification,
} from "@shared/repository/repository-write";
import {
  Copy,
  GitBranch,
  GitMerge,
  GitPullRequestArrow,
  Link,
  Pencil,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  captureRepositoryCommand,
  repositoryCommandDispatcher,
  repositoryCommandReason,
} from "../../commands/repository-commands";
import {
  Button,
  Checkbox,
  CodeBlock,
  ErrorDialog,
  Field,
  Input,
  MenuItem,
  PopoverSurface,
  Radio,
} from "../../components/ui/index";
import { ModalSurfaceContext } from "../../components/ui/overlays/ModalSurface";
import { branchDeleteTargets } from "../../repository/branch-delete-targets";
import { useRepositoryStore } from "../../stores/repository-store";
import { copyText } from "../../utils/clipboard";
import { RemotesDialog } from "../sync/RemotesDialog";
import { TagDeletePanel } from "./TagDeletePanel";
import { MergeStartDialog } from "../workflows/MergeStartDialog";
import { RebaseDialog } from "../workflows/RebaseDialog";

export type ReferenceTarget = (
  | { kind: "branch"; ref: BranchSummary }
  | {
      kind: "tag";
      ref: TagSummary;
      remoteName?: string;
      remoteNames?: string[];
      remoteOid?: string;
      local?: boolean;
    }
) & { x: number; y: number };

type DeleteScope = "local" | "remote" | "both";

const actionTitleKeys = {
  delete: { branch: "referenceMenu.deleteBranchTitle", tag: "referenceMenu.deleteTagTitle" },
  rename: { branch: "referenceMenu.renameBranchTitle", tag: "referenceMenu.renameTagTitle" },
  create: {
    branch: "referenceMenu.createLocalBranchTitle",
    tag: "referenceMenu.createLocalTagTitle",
  },
  verify: { branch: "referenceMenu.verifyBranchTitle", tag: "referenceMenu.verifyTagTitle" },
  push: { branch: "remotesDialog.pushTab", tag: "referenceMenu.pushTag" },
} as const;

export function ReferenceMenu({
  repositoryId,
  target,
  onClose,
  onChanged,
}: {
  repositoryId: string;
  target: ReferenceTarget;
  onClose: () => void;
  onChanged?: (() => void) | undefined;
}) {
  const modalSurface = useContext(ModalSurfaceContext)?.current;
  const [context] = useState(() => captureRepositoryCommand(repositoryId));
  const dispatch = repositoryCommandDispatcher(context);
  useRepositoryStore((state) => state.writing);
  const unavailable = repositoryCommandReason(context);
  const [mode, setMode] = useState<
    "menu" | "rename" | "create" | "delete" | "verify" | "merge" | "rebase" | "push"
  >("menu");
  const [name, setName] = useState(target.ref.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const tagRunning = useRef(false);
  const [verification, setVerification] = useState<TagVerification | null>(null);
  const [targets, setTargets] = useState<ReturnType<typeof branchDeleteTargets> | null>(null);
  const [scope, setScope] = useState<DeleteScope>(
    target.kind === "branch" && target.ref.remote ? "remote" : "local",
  );
  const [force, setForce] = useState(false);
  const [remoteDeleted, setRemoteDeleted] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [auth, setAuth] = useState({ username: "", password: "" });
  const review = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mode === "delete" || mode === "verify") review.current?.focus();
  }, [mode]);
  const blocked = target.kind === "branch" && !!target.ref.worktreePath && !target.ref.isHead;
  const includesLocal = scope !== "remote";
  const includesRemote = scope !== "local";
  const branchChoices = targets
    ? (
        [
          ["local", t("referenceMenu.localOnly"), !!targets.local && !targets.localBlocked],
          ["remote", t("referenceMenu.remoteOnly"), !!targets.remote && !remoteDeleted],
          [
            "both",
            t("referenceMenu.localAndRemote"),
            !!targets.local && !targets.localBlocked && !!targets.remote && !remoteDeleted,
          ],
        ] as const
      ).filter(([, , available]) => available)
    : [];
  const close = () => {
    if (!running.current && !tagRunning.current) onClose();
  };
  const assertContext = () => {
    const reason = repositoryCommandReason(context);
    if (reason) throw new AppError(errorText("errors.operationBlocked", { reason }));
  };
  const requireResult = <T,>(result: Result<T>): T => {
    if (!result.ok) {
      setNeedsAuth(result.error.kind === "auth-failed");
      throw new GitError(result.error);
    }
    return result.value;
  };
  const run = async (
    work: () => Promise<void>,
    options: { dismiss?: boolean; write?: boolean } = {},
  ) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      if (options.write !== false) assertContext();
      await work();
      if (options.dismiss !== false) onClose();
    } catch (failure) {
      setError(
        [
          errorMessage(failure, errorText("referenceMenu.theReferenceActionFailed")),
          errorAction(failure),
        ]
          .filter(Boolean)
          .join(" "),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const refresh = async () => {
    if (!repositoryCommandReason(context)) await useRepositoryStore.getState().refresh();
  };
  const deleteRef = () =>
    run(async () => {
      if (!targets) throw new AppError(ERROR_CODE.BRANCH_TARGETS_NOT_READY);
      if (includesLocal && (!targets.local || targets.localBlocked))
        throw new AppError(
          errorText("errors.operationBlocked", {
            reason: targets.localBlocked ?? t("referenceMenu.noMatchingLocalBranchExists"),
          }),
        );
      try {
        if (includesRemote && !remoteDeleted) {
          if (!targets.remote) throw new AppError(ERROR_CODE.TRACKED_BRANCH_MISSING);
          const credentials = needsAuth ? auth : undefined;
          const preview = requireResult(
            await window.eda.remotes.preparePush({
              repositoryId,
              remote: targets.remote.name,
              branch: targets.remote.branch,
              destination: targets.remote.branch,
              mode: "delete",
              setUpstream: false,
              ...(credentials ? { credentials } : {}),
            }),
          );
          assertContext();
          requireResult(await window.eda.remotes.push(repositoryId, preview.token, credentials));
          setRemoteDeleted(true);
          if (includesLocal) setScope("local");
        }
        if (includesLocal && targets.local) {
          assertContext();
          requireResult(
            await dispatch("deleteBranch", {
              repositoryId,
              name: targets.local.name,
              ...(force ? { force: true } : {}),
            }),
          );
        }
      } finally {
        await refresh();
      }
    });

  if (mode === "push" && target.kind === "tag")
    return (
      <RemotesDialog
        repositoryId={repositoryId}
        initialTag={target.ref.name}
        onChanged={onChanged}
        {...(target.remoteName ? { initialRemote: target.remoteName } : {})}
        onClose={onClose}
      />
    );
  if (mode === "merge")
    return (
      <MergeStartDialog repositoryId={repositoryId} source={target.ref.oid} onClose={onClose} />
    );
  if (mode === "rebase")
    return (
      <RebaseDialog
        repositoryId={repositoryId}
        action="start"
        onto={target.ref.oid}
        onClose={onClose}
      />
    );

  const top = Math.max(8, Math.min(target.y, window.innerHeight - 460));
  const left = Math.max(8, Math.min(target.x, window.innerWidth - 320));
  const bounds = modalSurface?.getBoundingClientRect();

  return createPortal(
    <PopoverSurface
      role={mode === "menu" ? "menu" : "dialog"}
      aria-label={
        mode === "menu"
          ? t(target.kind === "branch" ? "referenceMenu.branchActions" : "referenceMenu.tagActions")
          : t(actionTitleKeys[mode][target.kind])
      }
      onClose={close}
      style={{
        position: modalSurface ? "absolute" : "fixed",
        left: left - (bounds?.left ?? 0) + (modalSurface?.scrollLeft ?? 0),
        top: top - (bounds?.top ?? 0) + (modalSurface?.scrollTop ?? 0),
        maxHeight: `calc(100vh - ${top + 8}px)`,
      }}
      className="fixed w-[312px] overflow-y-auto p-1"
    >
      <p
        className="truncate px-2 py-1 text-xs font-semibold text-text-tertiary"
        title={target.ref.name}
      >
        {target.ref.name}
      </p>
      {mode === "menu" && (
        <>
          <MenuItem
            disabled={
              busy ||
              !!unavailable ||
              (target.kind === "tag" && target.local === false) ||
              (target.kind === "branch" && (target.ref.isHead || blocked))
            }
            onClick={() =>
              void run(async () => {
                requireResult(
                  await dispatch(target.kind === "tag" ? "checkoutTag" : "checkoutBranch", {
                    repositoryId,
                    name: target.ref.name,
                  }),
                );
                await refresh();
              })
            }
          >
            <GitBranch size={13} />
            {t("referenceMenu.checkOut", {
              kind: target.kind,
              value2: target.kind === "tag" ? t("referenceMenu.detachedHead") : "",
            })}
          </MenuItem>
          {target.kind === "branch" && (
            <>
              <MenuItem
                disabled={!!unavailable || target.ref.isHead}
                onClick={() => setMode("rebase")}
              >
                <GitPullRequestArrow size={13} />
                {t("referenceMenu.rebaseCurrentBranchOntoThis")}
              </MenuItem>
              <MenuItem
                disabled={!!unavailable || target.ref.isHead}
                onClick={() => setMode("merge")}
              >
                <GitMerge size={13} />
                {t("referenceMenu.mergeIntoCurrentBranch")}
              </MenuItem>
              <MenuItem
                disabled={!!unavailable || blocked}
                onClick={() => {
                  setName(
                    target.ref.remote
                      ? target.ref.name.split("/").slice(1).join("/")
                      : target.ref.name,
                  );
                  setMode(target.ref.remote ? "create" : "rename");
                }}
              >
                <Pencil size={13} />
                {target.ref.remote
                  ? t("referenceMenu.createLocalBranchHere")
                  : t("referenceMenu.renameBranch")}
              </MenuItem>
            </>
          )}
          <MenuItem onClick={() => void run(() => copyText(target.ref.name), { write: false })}>
            <Copy size={13} />
            {t("referenceMenu.copyName")}
          </MenuItem>
          <MenuItem
            onClick={() =>
              void run(
                () =>
                  copyText(
                    target.kind === "tag" ? (target.remoteOid ?? target.ref.oid) : target.ref.oid,
                  ),
                { write: false },
              )
            }
          >
            <Copy size={13} />
            {t("referenceMenu.copySha")}
          </MenuItem>
          <MenuItem
            onClick={() =>
              void run(
                async () => {
                  const url =
                    target.kind === "tag" && target.remoteName
                      ? referenceLink(
                          requireResult(
                            await window.eda.remotes.inspect(repositoryId),
                          ).remotes.find((remote) => remote.name === target.remoteName)
                            ?.pushUrls[0] ?? "",
                          "tag",
                          target.ref.name,
                        )
                      : requireResult(
                          await window.eda.repository.referenceUrl(
                            repositoryId,
                            target.kind === "branch" && target.ref.remote
                              ? "remote-branch"
                              : target.kind,
                            target.ref.name,
                          ),
                        );
                  if (!url) throw new AppError(ERROR_CODE.REMOTE_BROWSER_URL_UNAVAILABLE);
                  await copyText(url);
                },
                { write: false },
              )
            }
          >
            <Link size={13} />
            {t("referenceMenu.copyBrowserUrl")}
          </MenuItem>
          {target.kind === "tag" && (
            <>
              <MenuItem
                disabled={busy || !!unavailable || target.local === false}
                onClick={() => setMode("push")}
              >
                <Upload size={13} />
                {t("referenceMenu.pushTag")}
              </MenuItem>
              <MenuItem
                disabled={busy || !!unavailable || target.local === false}
                onClick={() => {
                  setMode("verify");
                  void run(
                    async () => {
                      setVerification(
                        requireResult(
                          await window.eda.repository.verifyTag({
                            repositoryId,
                            name: target.ref.name,
                          }),
                        ),
                      );
                    },
                    { dismiss: false },
                  );
                }}
              >
                <ShieldCheck size={13} />
                {t("referenceMenu.verifyTagSignature")}
              </MenuItem>
              {target.remoteName && target.local !== false && (
                <p className="px-2 py-1 text-xs text-text-tertiary">
                  {t("referenceMenu.localTagActions")}
                </p>
              )}
              {target.local === false && (
                <p className="px-2 py-1 text-xs text-text-tertiary">
                  {t("referenceMenu.fetchTagFirst")}
                </p>
              )}
            </>
          )}
          <MenuItem
            disabled={busy || !!unavailable}
            className="text-git-deleted"
            onClick={() => {
              setMode("delete");
              if (target.kind === "branch")
                void run(
                  async () => {
                    const state = requireResult(await window.eda.remotes.inspect(repositoryId));
                    assertContext();
                    const resolved = branchDeleteTargets(target.ref, state);
                    setTargets(resolved);
                    if ((!resolved.local || resolved.localBlocked) && resolved.remote)
                      setScope("remote");
                  },
                  { dismiss: false },
                );
            }}
          >
            <Trash2 size={13} />
            {t(
              target.kind === "branch"
                ? "referenceMenu.deleteBranchAction"
                : "referenceMenu.deleteTagAction",
            )}
          </MenuItem>
        </>
      )}
      {(mode === "rename" || mode === "create") && (
        <form
          className="space-y-3 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || busy) return;
            void run(async () => {
              requireResult(
                mode === "create"
                  ? await dispatch("createBranch", {
                      repositoryId,
                      name: name.trim(),
                      startPoint: target.ref.oid,
                      checkout: true,
                    })
                  : await dispatch("renameBranch", {
                      repositoryId,
                      from: target.ref.name,
                      to: name.trim(),
                    }),
              );
              await refresh();
            });
          }}
        >
          <Field
            label={
              mode === "rename"
                ? t("referenceMenu.renameBranchTo")
                : t("referenceMenu.newLocalBranchName")
            }
          >
            {(field) => (
              <Input
                {...field}
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <Button
            type="submit"
            size="sm"
            busy={busy}
            disabled={
              !!unavailable || !name.trim() || (mode === "rename" && name === target.ref.name)
            }
          >
            {mode === "rename"
              ? t("referenceMenu.renameBranchTitle")
              : t("referenceMenu.createLocalBranch")}
          </Button>
        </form>
      )}
      {mode === "delete" && target.kind === "tag" && (
        <TagDeletePanel
          repositoryId={repositoryId}
          name={target.ref.name}
          remoteOnly={target.local === false}
          {...((target.remoteName ?? target.remoteNames?.[0])
            ? { initialRemote: (target.remoteName ?? target.remoteNames?.[0])! }
            : {})}
          onChanged={onChanged}
          onClose={onClose}
          onBusyChange={(busy) => {
            tagRunning.current = busy;
          }}
        />
      )}
      {mode === "delete" && target.kind === "branch" && (
        <div ref={review} tabIndex={-1} className="space-y-3 p-2 text-xs">
          {target.kind === "branch" && (
            <>
              {busy && !targets && <p role="status">{t("referenceMenu.loadingBranchTargets")}</p>}
              {targets && (
                <>
                  {branchChoices.length > 0 && (
                    <fieldset className="space-y-2" disabled={busy}>
                      <legend className="mb-2 font-medium">
                        {t("referenceMenu.deleteBranchFrom")}
                      </legend>
                      {branchChoices.map(([value, label]) => (
                        <label key={value} className="flex items-center gap-2">
                          <Radio
                            name="delete-scope"
                            value={value}
                            checked={scope === value}
                            onChange={() => setScope(value)}
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {targets.local && (
                    <p className="break-all">
                      {t("referenceMenu.local", { name: targets.local.name })}
                    </p>
                  )}
                  {targets.remote && !remoteDeleted && (
                    <p className="break-all">
                      {t("referenceMenu.remote", {
                        name: targets.remote.name,
                        branch: targets.remote.branch,
                      })}
                    </p>
                  )}
                  {!targets.remote && <p>{t("referenceMenu.noTrackedRemoteBranchIsConfigured")}</p>}
                  {targets.localBlocked && <p>{targets.localBlocked}</p>}
                  {includesRemote && (
                    <p>
                      {t("referenceMenu.thisRemovesTheBranchFromTheRemoteRepositoryForEveryone")}
                    </p>
                  )}
                  {includesLocal && !targets.localBlocked && (
                    <Checkbox
                      checked={force}
                      disabled={busy}
                      onChange={(event) => setForce(event.target.checked)}
                    >
                      {t("referenceMenu.deleteLocalBranchEvenIfUnmerged")}
                    </Checkbox>
                  )}
                </>
              )}
            </>
          )}
          {remoteDeleted && (
            <p role="status">
              {t("referenceMenu.remoteBranchDeleted", {
                value1: includesLocal
                  ? t("referenceMenu.localDeletionHasNotCompletedRetryToDeleteItLocally")
                  : "",
              })}
            </p>
          )}
          {needsAuth && includesRemote && !remoteDeleted && (
            <>
              <Field label={t("referenceMenu.hTtpsUsername")}>
                {(field) => (
                  <Input
                    {...field}
                    autoComplete="off"
                    value={auth.username}
                    onChange={(event) => setAuth({ ...auth, username: event.target.value })}
                  />
                )}
              </Field>
              <Field label={t("referenceMenu.accessToken")}>
                {(field) => (
                  <Input
                    {...field}
                    type="password"
                    autoComplete="off"
                    value={auth.password}
                    onChange={(event) => setAuth({ ...auth, password: event.target.value })}
                  />
                )}
              </Field>
            </>
          )}
          <div className="flex gap-2">
            <Button size="sm" autoFocus disabled={busy} onClick={close}>
              {t("common.cancel")}
            </Button>
            {branchChoices.some(([value]) => value === scope) && (
              <Button
                size="sm"
                variant="danger"
                busy={busy}
                disabled={
                  !!unavailable ||
                  (target.kind === "branch" &&
                    (!targets ||
                      (includesLocal && (!targets.local || !!targets.localBlocked)) ||
                      (includesRemote && !targets.remote))) ||
                  (needsAuth &&
                    includesRemote &&
                    !remoteDeleted &&
                    (!auth.username.trim() || !auth.password))
                }
                onClick={() => void deleteRef()}
              >
                {t(
                  scope === "both"
                    ? "referenceMenu.deleteBoth"
                    : scope === "local"
                      ? "referenceMenu.deleteLocal"
                      : "referenceMenu.deleteRemote",
                )}
              </Button>
            )}
          </div>
        </div>
      )}
      {mode === "verify" && (
        <div ref={review} tabIndex={-1} className="space-y-2 p-2 text-xs">
          <Button size="sm" autoFocus disabled={busy} onClick={close}>
            {t("common.close")}
          </Button>
          {busy && <p role="status">{t("referenceMenu.verifyingTagSignature")}</p>}
          {target.kind === "tag" && (
            <p>
              {target.ref.annotated
                ? t("referenceMenu.annotatedTag", { value1: target.ref.tagger ?? "" })
                : t("referenceMenu.lightweightTag")}
            </p>
          )}
          {target.kind === "tag" && target.ref.message && (
            <CodeBlock label={t("referenceMenu.tagMessage")} wrap>
              {target.ref.message}
            </CodeBlock>
          )}
          {verification && (
            <>
              <p role="status">
                {verification.status === "verified"
                  ? t("referenceMenu.signatureVerified")
                  : verification.status === "unsigned"
                    ? t("referenceMenu.unsignedTag")
                    : t("referenceMenu.signatureNotVerified")}
              </p>
              <CodeBlock label={t("referenceMenu.signatureVerificationOutput")} wrap>
                {verification.diagnostics}
              </CodeBlock>
            </>
          )}
        </div>
      )}
      {unavailable && <p className="px-2 py-1 text-xs text-text-tertiary">{unavailable}</p>}
      {error && <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>}
    </PopoverSurface>,
    modalSurface ?? document.body,
  );
}
