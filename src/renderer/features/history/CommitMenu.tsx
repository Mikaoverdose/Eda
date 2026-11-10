import { errorText } from "@shared/error-codes";
import { errorMessage, type Result } from "@shared/errors";
import { t } from "@shared/i18n";
import {
  CherryIcon as Cherry,
  CopyIcon as Copy,
  BranchIcon as GitBranch,
  GitCommitHorizontalIcon as GitCommitHorizontal,
  GitMergeIcon as GitMerge,
  LinkIcon as Link,
  RotateCcwIcon as RotateCcw,
  TagIcon as Tag,
  Undo2Icon as Undo2,
} from "../../components/ui/icons";
import { useRef, useState } from "react";
import {
  captureRepositoryCommand,
  repositoryCommandDispatcher,
  repositoryCommandReason,
} from "../../commands/repository-commands";
import {
  Button,
  Checkbox,
  ErrorDialog,
  Input,
  MenuItem,
  ContextPopover,
  Textarea,
} from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";
import { useRepositoryStore } from "../../stores/repository-store";
import { copyText } from "../../utils/clipboard";
import { MergeStartDialog } from "../workflows/MergeStartDialog";
import { ReplayDialog } from "../workflows/ReplayDialog";
import { ResetDialog } from "../workflows/ResetDialog";

export interface CommitMenuTarget {
  oid: string;
  x: number;
  y: number;
}

export function CommitMenu({
  target,
  onClose,
  initialMode = "menu",
}: {
  target: CommitMenuTarget;
  onClose: () => void;
  initialMode?: "menu" | "tag" | "branch";
}) {
  const repositoryId = useAppStore((state) => state.selectedRepositoryId);
  const commandContext = captureRepositoryCommand(repositoryId ?? "");
  const dispatch = repositoryCommandDispatcher(commandContext);
  const commandUnavailable = repositoryCommandReason(commandContext);
  const refresh = useRepositoryStore((state) => state.refresh);

  const [mode, setMode] = useState<
    "menu" | "tag" | "branch" | "merge" | "cherry-pick" | "revert" | "reset"
  >(initialMode);

  const [name, setName] = useState("");
  const [sign, setSign] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);

  if (!repositoryId) return null;
  if (mode === "reset")
    return <ResetDialog repositoryId={repositoryId} target={target.oid} onClose={onClose} />;

  if (mode === "cherry-pick" || mode === "revert")
    return (
      <ReplayDialog
        repositoryId={repositoryId}
        kind={mode}
        action="start"
        initialCommit={target.oid}
        onClose={onClose}
      />
    );

  if (mode === "merge")
    return <MergeStartDialog repositoryId={repositoryId} source={target.oid} onClose={onClose} />;

  const run = async (work: () => Promise<Result<unknown>>) => {
    if (submitting.current) return;

    if (commandUnavailable) {
      setError(commandUnavailable);
      return;
    }

    submitting.current = true;
    setBusy(true);
    setError(null);

    try {
      const result = await work();

      if (!result.ok) {
        setError(errorMessage(result.error, errorText("commitMenu.thatDidNotWork")));
        return;
      }

      await refresh();
      onClose();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const canCreate =
    !busy && !commandUnavailable && !!name.trim() && !(mode === "tag" && sign && !message.trim());

  const createReference = () => {
    if (!canCreate) return;

    void run(() =>
      mode === "tag"
        ? dispatch("createTag", {
            repositoryId,
            name: name.trim(),
            target: target.oid,
            ...(message.trim() ? { message } : {}),
            sign,
          })
        : dispatch("createBranch", {
            repositoryId,
            name: name.trim(),
            startPoint: target.oid,
            checkout: true,
          }),
    );
  };

  return (
    <ContextPopover
      role={mode === "menu" ? "menu" : "dialog"}
      onClose={onClose}
      aria-label={
        mode === "menu" ? t("commitMenu.commitActions") : t("commitMenu.create", { mode: mode })
      }
      position={target}
      className="w-56"
    >
      <p className="mono truncate px-2 py-1 text-xs text-text-tertiary">
        {target.oid.slice(0, 10)}
      </p>

      {mode === "menu" && (
        <>
          <MenuItem
            onClick={() =>
              void copyText(target.oid)
                .then(onClose)
                .catch(() => setError(t("commitMenu.theCommitIdCouldNotBeCopied")))
            }
          >
            <Copy size={13} className="shrink-0" aria-hidden="true" />
            {t("commitMenu.copyCommitSha")}
          </MenuItem>

          <MenuItem onClick={() => setMode("branch")}>
            <GitBranch size={13} className="shrink-0" aria-hidden="true" />
            {t("commitMenu.createBranchHere")}
          </MenuItem>

          <MenuItem disabled={!!commandUnavailable} onClick={() => setMode("merge")}>
            <GitMerge size={13} className="shrink-0" aria-hidden="true" />
            {t("commitMenu.mergeIntoCurrentBranch")}
          </MenuItem>

          <MenuItem disabled={!!commandUnavailable} onClick={() => setMode("reset")}>
            <RotateCcw size={13} className="shrink-0" aria-hidden="true" />
            {t("commitMenu.resetCurrentBranchHere")}
          </MenuItem>

          <MenuItem disabled={!!commandUnavailable} onClick={() => setMode("cherry-pick")}>
            <Cherry size={13} className="shrink-0" aria-hidden="true" />
            {t("commitMenu.cherryPick")}
          </MenuItem>

          <MenuItem disabled={!!commandUnavailable} onClick={() => setMode("revert")}>
            <Undo2 size={13} className="shrink-0" aria-hidden="true" />
            {t("commitMenu.revert")}
          </MenuItem>

          <MenuItem
            onClick={async () => {
              const result = await window.eda.repository.referenceUrl(
                repositoryId,
                "commit",
                target.oid,
              );

              if (!result.ok) setError(errorMessage(result.error));
              else if (!result.value)
                setError(t("commitMenu.noSupportedBrowserUrlIsAvailableForTheDefaultRemote"));
              else
                await copyText(result.value)
                  .then(onClose)
                  .catch(() => setError(t("commitMenu.theUrlCouldNotBeCopied")));
            }}
          >
            <Link size={13} className="shrink-0" aria-hidden="true" />
            {t("commitMenu.copyCommitBrowserUrl")}
          </MenuItem>

          <MenuItem onClick={() => setMode("tag")}>
            <Tag size={13} className="shrink-0" aria-hidden="true" />
            {t("commitMenu.createTagHere")}
          </MenuItem>

          <MenuItem
            disabled={busy || !!commandUnavailable}
            onClick={() =>
              void run(() => dispatch("checkoutBranch", { repositoryId, name: target.oid }))
            }
          >
            <GitCommitHorizontal size={13} className="shrink-0" aria-hidden="true" />
            {t("commitMenu.checkOutThisCommit")}
          </MenuItem>
        </>
      )}

      {mode !== "menu" && (
        <div className="p-1">
          <Input
            size="sm"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;

              event.preventDefault();
              createReference();
            }}
            placeholder={
              mode === "tag"
                ? t("commitMenu.tagNameThenEnter")
                : t("commitMenu.branchNameThenEnter")
            }
            aria-label={mode === "tag" ? t("commitMenu.tagName") : t("commitMenu.branchName")}
          />

          {mode === "tag" && (
            <Textarea
              aria-label={t("commitMenu.annotatedTagMessage")}
              placeholder={t("commitMenu.optionalAnnotationEmptyCreatesALightweightTag")}
              className="mt-2 text-xs"
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          )}

          {mode === "tag" && (
            <Checkbox
              className="flex gap-2 p-2 text-xs"
              checked={sign}
              onChange={(event) => setSign(event.target.checked)}
            >
              {t("commitMenu.signWithThisProfileSsshgpgKey")}
            </Checkbox>
          )}

          <Button size="sm" variant="primary" block disabled={!canCreate} onClick={createReference}>
            {t("commitMenu.create", { mode: mode })}
          </Button>
        </div>
      )}

      {commandUnavailable && <p className="text-xs text-text-tertiary">{commandUnavailable}</p>}
      {error && <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>}
    </ContextPopover>
  );
}
