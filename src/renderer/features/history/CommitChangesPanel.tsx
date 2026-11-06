import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { stateLabel } from "@shared/i18n/labels";
import type { CommitInspection, FileDiff } from "@shared/repository/repository-read";
import { useEffect, useState } from "react";
import { PanelControls } from "../../components/layout/PanelControls";
import { usePanel } from "../../components/layout/hooks/usePanel";
import { VirtualRows } from "../../components/ui/display/VirtualRows";
import { LoadingContent } from "../../components/ui/feedback/Skeleton";
import {
  ButtonBase,
  ErrorDialog,
  SearchField,
  StateMessage,
  TextButton,
} from "../../components/ui/index";
import { useRepositoryStore } from "../../stores/repository-store";
import { CommitDetails } from "../diff/CommitDetails";

const statusLabels: Record<FileDiff["status"], string> = {
  added: "A",
  deleted: "D",
  modified: "M",
  renamed: "R",
  copied: "C",
  "type-changed": "T",
};

const statusTones: Record<FileDiff["status"], string> = {
  added: "text-git-added",
  deleted: "text-git-deleted",
  modified: "text-git-modified",
  renamed: "text-git-renamed",
  copied: "text-git-added",
  "type-changed": "text-git-modified",
};

export function CommitChangesPanel() {
  const repositoryId = useRepositoryStore((state) => state.repositoryId);
  const generation = useRepositoryStore((state) => state.generation);
  const selection = useRepositoryStore((state) => state.selection);
  const oid = selection?.kind === "commit" ? selection.oid : null;
  const pages = useRepositoryStore((state) => state.pages);
  const diff = useRepositoryStore((state) => state.diff);
  const loading = useRepositoryStore((state) => state.diffLoading);
  const error = useRepositoryStore((state) => state.error);
  const selectedPath = useRepositoryStore((state) => state.commitFilePath);
  const selectFile = useRepositoryStore((state) => state.selectCommitFile);
  const showWorkingTree = useRepositoryStore((state) => state.showWorkingTree);
  const changeCount = useRepositoryStore((state) => state.status?.changes.length ?? 0);
  const truncatedChanges = useRepositoryStore((state) => state.truncatedChanges);
  const [query, setQuery] = useState("");
  const [details, setDetails] = useState<{
    oid: string;
    inspection?: CommitInspection;
    error?: string;
  } | null>(null);
  const panel = usePanel("rail");

  useEffect(() => {
    let alive = true;

    setQuery("");
    setDetails(null);

    if (repositoryId && oid) {
      void window.eda.repository.inspectCommit(repositoryId, oid).then((result) => {
        if (!alive) return;
        setDetails(
          result.ok
            ? { oid, inspection: result.value }
            : { oid, error: errorMessage(result.error) },
        );
      });
    }

    return () => {
      alive = false;
    };
  }, [repositoryId, generation, oid]);

  const inspection = details?.oid === oid ? (details.inspection ?? null) : null;
  const commit =
    inspection?.commit ?? pages.flatMap((page) => page.commits).find((item) => item.oid === oid);
  const files = (diff?.files ?? []).filter((file) =>
    [file.newPath, file.oldPath].some((path) =>
      path?.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    ),
  );

  return (
    <section
      data-tour="commit-files"
      aria-label={t("commitChangesPanel.commitFileChanges")}
      className="app-surface-panel flex h-full min-h-0 w-full min-w-0 flex-col"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <h3 className="truncate text-sm font-semibold text-text-secondary">
          {t("commitChangesPanel.fileChanges")}
        </h3>
        <span className="ml-auto" />
        <PanelControls
          name={t("commitChangesPanel.fileChangesLabel")}
          state={panel.state}
          onToggleMaximize={panel.toggleMaximize}
          onToggleCollapse={panel.toggleCollapse}
          collapseDirection="right"
        />
      </header>
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-accent-border bg-accent-muted px-3 py-1.5 text-xs text-text-primary">
        <span role="status">
          {changeCount
            ? t(
                truncatedChanges
                  ? "commitChangesPanel.workingTreeChangesTruncated"
                  : "commitChangesPanel.workingTreeChanges",
                { count: changeCount },
              )
            : t("commitChangesPanel.workingTreeClean")}
        </span>
        <ButtonBase
          onClick={showWorkingTree}
          className="shrink-0 rounded-sm border border-accent-border px-1.5 py-0.5 text-xs text-accent-text hover:bg-bg-raised"
        >
          {changeCount
            ? t("commitChangesPanel.viewWorkingTreeChanges")
            : t("commitChangesPanel.workingTree")}
        </ButtonBase>
      </div>
      <div className="max-h-[40%] shrink-0 overflow-auto">
        {commit && (
          <CommitDetails
            commit={commit}
            inspection={inspection}
            onSelectParent={(parent) => void useRepositoryStore.getState().jumpToCommit(parent)}
          />
        )}
        {details?.oid === oid && details.error && <ErrorDialog>{details.error}</ErrorDialog>}
      </div>
      <div className="shrink-0 border-b border-border-subtle px-3 py-2">
        <SearchField
          aria-label={t("commitChangesPanel.filterCommitFiles")}
          placeholder={t("commitChangesPanel.filterFiles")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full"
        />
      </div>
      {loading ? (
        <LoadingContent label={t("commitChangesPanel.loadingCommitFiles")} />
      ) : error ? (
        <ErrorDialog
          title={t("commitChangesPanel.couldNotLoadCommitFiles")}
          actions={
            <TextButton
              onClick={() => {
                if (oid) void useRepositoryStore.getState().selectCommit(oid);
              }}
            >
              {t("common.retry")}
            </TextButton>
          }
        >
          {errorMessage(error)}
        </ErrorDialog>
      ) : files.length === 0 ? (
        <StateMessage
          className="min-h-0 flex-1"
          title={
            query ? t("commitChangesPanel.noMatchingFiles") : t("commitChangesPanel.noChangedFiles")
          }
        />
      ) : (
        <VirtualRows
          scrollKey={`${repositoryId}:${generation}:${oid}:files:${query}`}
          ariaLabel={t("commitChangesPanel.changedFilesInCommit")}
          items={files}
          rowHeight={36}
          className="min-h-0 flex-1"
          horizontalScroll={false}
          renderRow={(file) => {
            const path = file.newPath ?? file.oldPath!;
            const renamed = file.oldPath && file.newPath && file.oldPath !== file.newPath;

            return (
              <ButtonBase
                key={path}
                data-tour={path === "README.md" ? "commit-file-readme" : undefined}
                aria-label={t("commitChangesPanel.viewCommitDiffFor", { path: path })}
                aria-pressed={selectedPath === path}
                title={`${stateLabel(file.status)}: ${renamed ? t("commitChangesPanel.to", { oldPath: file.oldPath, path: path }) : path}`}
                onClick={() => void selectFile(path)}
                className={`ui-interactive flex h-9 w-full min-w-0 items-center gap-2 px-3 text-left text-xs hover:bg-bg-raised ${selectedPath === path ? "bg-accent-muted text-accent-text" : "text-text-secondary"}`}
              >
                <span
                  aria-label={stateLabel(file.status)}
                  className={`mono shrink-0 ${statusTones[file.status]}`}
                >
                  {statusLabels[file.status]}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {renamed
                    ? t("commitChangesPanel.to", { oldPath: file.oldPath, path: path })
                    : path}
                </span>
                {file.binary && (
                  <span className="shrink-0 text-text-tertiary">
                    {t("commitChangesPanel.binary")}
                  </span>
                )}
              </ButtonBase>
            );
          }}
        />
      )}
      <footer className="shrink-0 border-t border-border-subtle px-3 py-2 text-xs text-text-tertiary">
        {loading
          ? t("commitChangesPanel.loadingFiles")
          : t("commitChangesPanel.ofChangedFiles", {
              length: files.length,
              value2: diff?.files.length ?? 0,
            })}
        {!!diff?.omittedFiles && (
          <p role="status">
            {t("commitChangesPanel.additionalFilesOmittedByThePreviewLimit", {
              omittedFiles: diff.omittedFiles,
            })}
          </p>
        )}
      </footer>
    </section>
  );
}
