import { errorAction, errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { GIT_FILE_MODE, isRegularFileMode } from "@shared/repository/git-file-mode";
import { conflictSides } from "@shared/workflows/conflict-sides";
import type {
  ConflictPreview,
  ConflictVersion,
  ResolveConflictRequest,
} from "@shared/workflows/workflow";
import { useEffect, useState } from "react";
import {
  Button,
  CodeBlock,
  Dialog,
  ErrorDialog,
  Select,
  Textarea,
} from "../../components/ui/index";
import { useRepositoryStore } from "../../stores/repository-store";

const conflictTypes: Record<string, string> = {
  DD: t("conflictDialog.deletedOnBothSides"),
  AU: t("conflictDialog.addedOnCurrentSide"),
  UD: t("conflictDialog.deletedOnIncomingSide"),
  UA: t("conflictDialog.addedOnIncomingSide"),
  DU: t("conflictDialog.deletedOnCurrentSide"),
  AA: t("conflictDialog.addedOnBothSides"),
  UU: t("conflictDialog.modifiedOnBothSides"),
};

function canEdit(preview: ConflictPreview): boolean {
  return (
    preview.output !== null &&
    [preview.current, preview.incoming].every((value) => !value || isRegularFileMode(value.mode))
  );
}

function initialChoice(preview: ConflictPreview): ResolveConflictRequest["choice"] {
  if (canEdit(preview)) return "text";
  return [preview.base, preview.current, preview.incoming].some(
    (value) => value?.mode === GIT_FILE_MODE.submodule,
  )
    ? "current"
    : "worktree";
}

function Version({ title, value }: { title: string; value: ConflictVersion | null }) {
  return (
    <section className="min-w-0 rounded border border-border-default">
      <h3 className="border-b border-border-subtle px-3 py-2 text-xs font-medium">{title}</h3>
      <CodeBlock label={title} className="h-44 rounded-none border-0">
        {!value
          ? t("conflictDialog.absentOnThisSide")
          : value.mode === GIT_FILE_MODE.submodule
            ? t("conflictDialog.submoduleCommit", { oid: value.oid })
            : (value.text ??
              t("conflictDialog.binaryOrLargeContentBytes", {
                bytes: value.bytes,
                oid: value.oid,
              }))}
      </CodeBlock>
    </section>
  );
}

export function ConflictDialog({
  repositoryId,
  onClose,
}: {
  repositoryId: string;
  onClose: () => void;
}) {
  const status = useRepositoryStore((state) => state.status);
  const conflicts = status?.changes.filter((change) => change.kind === "unmerged") ?? [];
  const [preview, setPreview] = useState<ConflictPreview | null>(null);
  const [output, setOutput] = useState("");
  const [choice, setChoice] = useState<ResolveConflictRequest["choice"]>("text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const dirty =
    !!preview && (output !== (preview.output ?? "") || choice !== initialChoice(preview));
  const guard = (next: () => void) => {
    if (busy) return;
    if (dirty) setLeave(() => next);
    else next();
  };
  const load = async (path: string, keepOutput = false) => {
    setBusy(true);
    setError(null);

    try {
      const result = await window.eda.conflicts.inspect(repositoryId, path);

      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }

      setPreview(result.value);

      if (!keepOutput) {
        setOutput(result.value.output ?? "");
        setChoice(initialChoice(result.value));
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (conflicts[0]) void load(conflicts[0].path);
  }, [repositoryId]);

  const save = async (stage: boolean) => {
    if (!preview) return;

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const result = await window.eda.conflicts.resolve({
        repositoryId,
        token: preview.token,
        choice,
        ...(choice === "text" ? { text: output } : {}),
        stage,
      });

      if (!result.ok) {
        setError(`${errorMessage(result.error)} ${errorAction(result.error) ?? ""}`);
        return;
      }

      await useRepositoryStore.getState().syncFromDisk();
      setMessage(
        stage
          ? t("conflictDialog.resolvedTheGitOperationIsNotYetCompleted", { path: preview.path })
          : t("conflictDialog.savedItRemainsUnresolvedUntilYouMarkItResolved", {
              path: preview.path,
            }),
      );

      if (!stage) await load(preview.path);
      else {
        setPreview(null);
        setOutput("");
      }
    } finally {
      setBusy(false);
    }
  };

  const external = async () => {
    if (!preview) return;

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const result = await window.eda.conflicts.external(repositoryId, preview.token);

      await useRepositoryStore.getState().syncFromDisk();

      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }

      setOutput(result.value.text);
      setChoice("text");
      setMessage(
        result.value.stale
          ? t("conflictDialog.theConflictChangedWhileTheToolWasOpen")
          : t("conflictDialog.externalToolFinishedReviewTheResultBelowThen"),
      );
    } finally {
      setBusy(false);
    }
  };

  const blocks = [
    ...output.matchAll(
      /^<<<<<<<[^\n]*\n([\s\S]*?)^=======[^\n]*\n([\s\S]*?)^>>>>>>>[^\n]*(?:\n|$)/gm,
    ),
  ];
  const chooseBlock = (index: number, side: "current" | "incoming" | "both") => {
    const block = blocks[index];

    if (!block || block.index === undefined) return;

    const current = block[1]!.split(/^\|\|\|\|\|\|\|[^\n]*\n/m)[0]!;
    const incoming = block[2]!;
    const replacement =
      side === "current" ? current : side === "incoming" ? incoming : current + incoming;

    setOutput(
      output.slice(0, block.index) + replacement + output.slice(block.index + block[0].length),
    );
    setChoice("text");
  };

  const submodule = [preview?.base, preview?.current, preview?.incoming].some(
    (value) => value?.mode === GIT_FILE_MODE.submodule,
  );
  const selectedSide =
    choice === "current" ? preview?.current : choice === "incoming" ? preview?.incoming : null;
  const indexOnly = submodule && (!selectedSide || selectedSide.mode === GIT_FILE_MODE.submodule);
  const markers = choice === "text" && /^(?:<{7}|={7}|>{7}|\|{7})(?: |\r?$)/m.test(output);
  const sides = conflictSides(preview?.workflow?.kind);

  return (
    <Dialog
      wide
      title={t("conflictDialog.resolveConflicts")}
      description={t(
        "conflictDialog.reviewBothSidesSaveTheResultThenDeliberatelyMarkEachPathResolved",
      )}
      onClose={() => guard(onClose)}
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={() => guard(onClose)}>
            {t("common.close")}
          </Button>
          <Button disabled={busy || !preview || indexOnly} onClick={() => void save(false)}>
            {t("conflictDialog.saveOutput")}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !preview || markers}
            onClick={() => void save(true)}
          >
            {t("conflictDialog.saveAndMarkResolved")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block text-xs">
          {t("conflictDialog.unresolvedPath")}
          <Select
            aria-label={t("conflictDialog.unresolvedPath")}
            className="mt-1 w-full"
            disabled={busy}
            value={preview?.path ?? ""}
            onValueChange={(value) => {
              const path = value;
              guard(() => void load(path));
            }}
          >
            <option value="" disabled>
              {conflicts.length
                ? t("conflictDialog.chooseAConflict")
                : t("conflictDialog.allPathsResolved")}
            </option>
            {conflicts.map((change) => (
              <option key={change.path} value={change.path}>
                {change.path},{" "}
                {conflictTypes[change.index + change.worktree] ?? t("conflictDialog.unresolved")}
              </option>
            ))}
          </Select>
        </label>
        {preview && (
          <>
            <p className="text-xs text-text-secondary">{sides.explanation}</p>
            {preview.workflow && (
              <p className="text-xs text-text-tertiary">
                {t("conflictDialog.currentHead", {
                  value1: preview.workflow.head?.slice(0, 12) ?? t("conflictDialog.unborn"),
                  value2:
                    preview.workflow.incoming.length > 0
                      ? t("conflictDialog.operationSource", {
                          value1: preview.workflow.incoming
                            .map((oid) => oid.slice(0, 12))
                            .join(", "),
                        })
                      : "",
                })}
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              <Version
                title={t("conflictDialog.indexStage1", { base: sides.base })}
                value={preview.base}
              />
              <Version
                title={
                  preview.workflow?.currentLabel ?? t("conflictDialog.currentContentIndexStage2")
                }
                value={preview.current}
              />
              <Version
                title={
                  preview.workflow?.incomingLabel ?? t("conflictDialog.incomingContentIndexStage3")
                }
                value={preview.incoming}
              />
            </div>
            {!canEdit(preview) && !submodule && (
              <p className="text-xs text-text-secondary">
                {t("conflictDialog.thisContentCannotBeEditedInTheText")}
              </p>
            )}
            <label className="block text-xs">
              {t("conflictDialog.resolution")}
              <Select
                aria-label={t("conflictDialog.resolutionChoice")}
                value={choice}
                disabled={busy}
                onValueChange={(value) => setChoice(value as ResolveConflictRequest["choice"])}
                className="mt-1 w-full"
              >
                {canEdit(preview) && (
                  <option value="text">{t("conflictDialog.editedOutputBelow")}</option>
                )}
                <option value="current">
                  {preview.current
                    ? t("conflictDialog.useWhole", { current: sides.current.toLowerCase() })
                    : t("conflictDialog.acceptDeletionFrom", {
                        current: sides.current.toLowerCase(),
                      })}
                </option>
                <option value="incoming">
                  {preview.incoming
                    ? t("conflictDialog.useIncomingVersion", {
                        incoming: sides.incoming.toLowerCase(),
                      })
                    : t("conflictDialog.acceptIncomingDeletion", {
                        incoming: sides.incoming.toLowerCase(),
                      })}
                </option>
                <option value="delete">{t("conflictDialog.deleteThisPathFromTheResult")}</option>
                {!submodule && (
                  <option value="worktree">
                    {t(
                      "conflictDialog.keepTheCurrentWorkingFileIncludingExternalEditsAlreadyInspected",
                    )}
                  </option>
                )}
              </Select>
            </label>
            <div className="space-y-2">
              <Button
                size="sm"
                disabled={busy || !canEdit(preview)}
                onClick={() => guard(() => void external())}
              >
                {t("conflictDialog.openExternalMergeTool")}
              </Button>
              <p className="text-xs text-text-tertiary">
                {t("conflictDialog.configureTheToolInApplicationSettingsItReceives")}
              </p>
            </div>
            {indexOnly && (
              <p className="text-xs text-text-secondary">
                {t("conflictDialog.thisRecordsTheSelectedSubmoduleCommitOrDeletion")}
              </p>
            )}
            {submodule && !indexOnly && preview.outputKind === "directory" && (
              <p className="text-xs text-text-secondary">
                {t("conflictDialog.aFolderOccupiesThisPathMoveItTo")}
              </p>
            )}
            {[preview.current, preview.incoming].some(
              (value) => value?.mode === GIT_FILE_MODE.symlink,
            ) && (
              <p className="text-xs text-text-secondary">
                {t("conflictDialog.chooseAWholeSideToKeepItsLink")}
              </p>
            )}
            {choice === "text" && (
              <>
                {!!blocks.length && (
                  <div className="flex flex-wrap gap-2">
                    {blocks.map((_, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-1 rounded border border-border-subtle p-1 text-xs"
                      >
                        <span>{t("conflictDialog.conflict", { value1: index + 1 })}</span>
                        {(["current", "incoming", "both"] as const).map((side) => (
                          <Button
                            key={side}
                            size="sm"
                            variant="quiet"
                            disabled={busy}
                            onClick={() => chooseBlock(index, side)}
                          >
                            {t("conflictDialog.use", {
                              value1:
                                side === "both"
                                  ? t("conflictDialog.both")
                                  : sides[side].toLowerCase(),
                            })}
                          </Button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                <label className="block text-xs">
                  {t("conflictDialog.resolvedOutput")}
                  <Textarea
                    aria-label={t("conflictDialog.resolvedOutput")}
                    spellCheck={false}
                    disabled={busy}
                    value={output}
                    onChange={(event) => setOutput(event.target.value)}
                    surface="base"
                    className="mt-1 h-60 resize-y font-mono"
                  />
                </label>
                {markers && (
                  <p className="text-xs text-git-modified">
                    {t(
                      "conflictDialog.removeRemainingConflictMarkersBeforeMarkingThisPathResolved",
                    )}
                  </p>
                )}
              </>
            )}
            <Button
              size="sm"
              variant="quiet"
              disabled={busy}
              onClick={() => void load(preview.path, true)}
            >
              {t("conflictDialog.recheckDiskStateKeepEditorText")}
            </Button>
          </>
        )}
        {message && (
          <p role="status" className="text-xs text-git-added">
            {message}
          </p>
        )}
        <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      </div>
      {leave && (
        <Dialog
          title={t("conflictDialog.discardUnsavedResolutionEdits")}
          description={t("conflictDialog.yourWorkingFileHasNotBeenChangedByTheseEditorEdits")}
          onClose={() => setLeave(null)}
          footer={
            <>
              <Button variant="quiet" onClick={() => setLeave(null)}>
                {t("conflictDialog.keepEditing")}
              </Button>
              <Button
                onClick={() => {
                  const next = leave;
                  setLeave(null);
                  next();
                }}
              >
                {t("conflictDialog.discardEditorEdits")}
              </Button>
            </>
          }
        >
          <p className="text-sm">
            {t("conflictDialog.saveOutputFirstIfYouWantToKeepTheseEditsOnDisk")}
          </p>
        </Dialog>
      )}
    </Dialog>
  );
}
