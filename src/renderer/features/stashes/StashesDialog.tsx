import { t } from "@shared/i18n";
import { formatDateTime } from "../../utils/format";
import { ArrowRightIcon as ArrowRight } from "../../components/ui/icons";
import type { StashContents } from "@shared/workflows/stashes";
import {
  Button,
  Dialog,
  Input,
  Select,
  Checkbox,
  CheckboxControl,
  ErrorDialog,
} from "../../components/ui/index";
import { DiffContent } from "../diff/DiffContent";
import { StashFileRestoreDialog } from "./StashFileRestoreDialog";
import { StashBranchDialog } from "./StashBranchDialog";
import { StashRenameDialog } from "./StashRenameDialog";
import { useStashesDialog } from "./hooks/useStashesDialog";

export function StashesDialog({
  repositoryId,
  onClose,
}: {
  repositoryId: string;
  onClose: () => void;
}) {
  const {
    list,
    inspection,
    area,
    setArea,
    setRestorePath,
    restoreDialog,
    setRestoreDialog,
    branchDialog,
    setBranchDialog,
    renameDialog,
    setRenameDialog,
    name,
    setName,
    contents,
    setContents,
    scope,
    setScope,
    selectedPaths,
    setSelectedPaths,
    keepIndex,
    setKeepIndex,
    eligiblePaths,
    confirmed,
    setConfirmed,
    restoreIndex,
    setRestoreIndex,
    notice,
    setNotice,
    busy,
    error,
    load,
    inspect,
    run,
    diff,
    restorePaths,
    selectedRestorePath,
    apply,
  } = useStashesDialog(repositoryId);

  return (
    <Dialog
      wide
      title={t("stashesDialog.stashes")}
      description={t("stashesDialog.stashesAreSharedByThisRepositorySWorktrees")}
      busy={busy}
      onClose={onClose}
      footer={
        <Button disabled={busy} onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      <div data-tour="stash-form" className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label>
            {t("stashesDialog.stashScope")}

            <Select
              aria-label={t("stashesDialog.stashScope")}
              value={scope}
              disabled={busy}
              onValueChange={(value) => setScope(value as typeof scope)}
              className="ml-2"
            >
              <option value="all">{t("stashesDialog.allEligibleChanges")}</option>
              <option value="selected">{t("stashesDialog.selectedPaths")}</option>
              <option value="staged">{t("stashesDialog.stagedChangesOnly")}</option>
            </Select>
          </label>

          {scope !== "staged" && (
            <Checkbox
              checked={keepIndex}
              disabled={busy}
              onChange={(event) => setKeepIndex(event.target.checked)}
            >
              {t("stashesDialog.keepStagedChangesInTheWorktreeAndIndex")}
            </Checkbox>
          )}
        </div>

        {scope === "selected" && (
          <fieldset className="max-h-40 overflow-auto rounded border border-border-subtle p-2 text-xs">
            <legend>{t("stashesDialog.pathsToStash")}</legend>

            {eligiblePaths.slice(0, 256).map((change) => (
              <label key={change.path} className="flex items-center gap-2 py-1">
                <CheckboxControl
                  aria-label={t("stashesDialog.stash", { path: change.path })}
                  disabled={busy}
                  checked={selectedPaths.includes(change.path)}
                  onChange={(event) =>
                    setSelectedPaths((paths) =>
                      event.target.checked
                        ? [...paths, change.path]
                        : paths.filter((path) => path !== change.path),
                    )
                  }
                />

                <span className="break-all">
                  {change.originalPath && (
                    <>
                      {change.originalPath}{" "}
                      <ArrowRight
                        size={12}
                        className="inline align-[-1px]"
                        aria-hidden="true"
                      />{" "}
                    </>
                  )}

                  {change.path}
                </span>
              </label>
            ))}

            {!eligiblePaths.length && <p>{t("stashesDialog.noEligibleChangedPaths")}</p>}

            {eligiblePaths.length > 256 && (
              <p>
                {t("stashesDialog.showingTheFirst256ChangedPathsStashABatchBeforeSelectingMore")}
              </p>
            )}
          </fieldset>
        )}

        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
          <Input
            aria-label={t("stashesDialog.stashName")}
            placeholder={t("stashesDialog.nameThisUnfinishedWork")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />

          <Select
            aria-label={t("stashesDialog.stashContents")}
            value={scope === "staged" ? "tracked" : contents}
            disabled={busy || scope === "staged"}
            onValueChange={(value) => setContents(value as StashContents)}
            className="w-full"
          >
            <option value="tracked">{t("stashesDialog.trackedFilesOnly")}</option>
            <option value="untracked">{t("stashesDialog.includeUntrackedFiles")}</option>
            <option value="all">{t("stashesDialog.includeUntrackedAndIgnoredFiles")}</option>
          </Select>

          <Button
            disabled={
              busy ||
              !name.trim() ||
              (scope === "selected" &&
                !eligiblePaths.some((change) => selectedPaths.includes(change.path)))
            }
            onClick={() => void run("create")}
          >
            {t("stashesDialog.createStash")}
          </Button>
        </div>

        {contents === "all" && scope !== "staged" && (
          <p className="text-xs text-git-modified">
            {t("stashesDialog.ignoredFilesWillAlsoBeSavedAndRemoved")}
          </p>
        )}

        <div className="flex gap-2">
          <Select
            aria-label={t("stashesDialog.savedStash")}
            value={inspection?.entry.selector ?? ""}
            disabled={busy}
            onValueChange={(value) => void inspect(value)}
            className="min-w-0 flex-1 text-xs"
          >
            <option value="" disabled>
              {list.entries.length
                ? t("stashesDialog.chooseAStashToInspect")
                : t("stashesDialog.noSavedStashes")}
            </option>

            {list.entries.map((entry) => (
              <option key={entry.selector} value={entry.selector}>
                {entry.selector}, {entry.message}
              </option>
            ))}
          </Select>

          <Button disabled={busy} onClick={() => void load()}>
            {t("common.refresh")}
          </Button>
        </div>

        {list.truncated && (
          <p className="text-xs text-git-modified">
            {t("stashesDialog.showingTheNewest200EntriesOlderEntriesRemainInGit")}
          </p>
        )}

        {inspection && (
          <>
            <p className="text-xs text-text-tertiary">
              {formatDateTime(inspection.entry.timestamp * 1000)} ,{" "}
              <code>{inspection.entry.oid}</code>
            </p>

            <Button disabled={busy} onClick={() => setRenameDialog(true)}>
              {t("stashesDialog.rename")}
            </Button>

            <Select
              aria-label={t("stashesDialog.stashDiff")}
              value={area}
              onValueChange={(value) => setArea(value as typeof area)}
              className="text-xs"
            >
              <option value="tracked">{t("stashesDialog.allTrackedChanges")}</option>
              <option value="staged">{t("stashesDialog.stagedChangesAtStashTime")}</option>
              <option value="untracked">{t("stashesDialog.untrackedIgnoredFiles")}</option>
            </Select>

            <div className="flex h-80 min-h-0 flex-col overflow-hidden rounded border border-border-default">
              {diff?.files.length ? (
                <DiffContent
                  key={`${inspection.entry.oid}:${area}`}
                  diff={diff}
                  mode="unified"
                  readOnly
                />
              ) : (
                <p className="p-3 text-xs text-text-tertiary">
                  {t("stashesDialog.noFilesInThisPartOfTheStash")}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Select
                aria-label={t("stashesDialog.stashFileToRestore")}
                className="min-w-0 flex-1"
                value={selectedRestorePath}
                disabled={busy || !restorePaths.length}
                onValueChange={(value) => setRestorePath(value)}
              >
                {!restorePaths.length && (
                  <option value="">{t("stashesDialog.noChangedFilesInThisVersion")}</option>
                )}

                {restorePaths.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </Select>

              <Button
                disabled={busy || !selectedRestorePath}
                onClick={() => setRestoreDialog(true)}
              >
                {t("stashesDialog.restoreFile")}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs">
              <Checkbox
                checked={restoreIndex}
                disabled={busy}
                onChange={(event) => setRestoreIndex(event.target.checked)}
              >
                {t("stashesDialog.restoreStagedChanges")}
              </Checkbox>

              <Button disabled={busy} onClick={() => void apply(false)}>
                {t("stashesDialog.applyStash")}
              </Button>
              <Button disabled={busy} onClick={() => void apply(true)}>
                {t("stashesDialog.popStash")}
              </Button>
              <Button disabled={busy} onClick={() => setBranchDialog(true)}>
                {t("stashesDialog.createBranch")}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs">
              <Checkbox
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                disabled={busy}
              >
                {t("stashesDialog.removeThisStashFromGitSStashList")}
              </Checkbox>

              <Button disabled={busy || !confirmed} onClick={() => void run("drop")}>
                {t("stashesDialog.dropSelectedStash")}
              </Button>
            </div>

            <p className="text-xs text-text-tertiary">
              {t("stashesDialog.applyKeepsTheSavedStashPopRemovesIt")}
            </p>
          </>
        )}

        {notice && (
          <p role="status" className="text-xs text-text-secondary">
            {notice}
          </p>
        )}

        <ErrorDialog>{error}</ErrorDialog>
      </div>

      {restoreDialog && inspection && (
        <StashFileRestoreDialog
          repositoryId={repositoryId}
          stashToken={inspection.token}
          area={area}
          path={selectedRestorePath}
          onClose={() => setRestoreDialog(false)}
          onRestored={() => {
            setRestoreDialog(false);

            setNotice(
              t("stashesDialog.restoredTheIndexAndStashWereRetainedA", {
                selectedRestorePath: selectedRestorePath,
              }),
            );
          }}
        />
      )}

      {renameDialog && inspection && (
        <StashRenameDialog
          repositoryId={repositoryId}
          inspection={inspection}
          onClose={() => setRenameDialog(false)}
          onRenamed={(keptOriginal) => {
            setRenameDialog(false);

            setNotice(
              keptOriginal
                ? t("stashesDialog.savedTheRenamedStashTheOriginalEntryWas")
                : t("stashesDialog.renamedStashAndMovedItToTheTopOfTheList"),
            );

            void load();
          }}
        />
      )}

      {branchDialog && inspection && (
        <StashBranchDialog
          repositoryId={repositoryId}
          stashToken={inspection.token}
          onClose={() => setBranchDialog(false)}
          onCreated={(name, applied) => {
            setBranchDialog(false);

            setNotice(
              applied
                ? t("stashesDialog.createdAndRestoredTheStashedWorkTheStashWasKept", { name: name })
                : t("stashesDialog.createdStashApplicationNeedsAttentionCloseThisDialog", {
                    name: name,
                  }),
            );
          }}
        />
      )}
    </Dialog>
  );
}
