import { errorText } from "@shared/error-codes";
import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { CollapsiblePanel } from "../components/layout/CollapsiblePanel";
import { usePanel } from "../components/layout/hooks/usePanel";
import { Split } from "../components/layout/Split";
import { LayoutTransition } from "../components/layout/ViewTransition";
import { Button, Dialog } from "../components/ui/index";
import { ChangesPanel } from "../features/changes/ChangesPanel";
import { CommitBox } from "../features/changes/CommitBox";
import { DiscardDialog } from "../features/changes/DiscardDialog";
import { DiffViewer } from "../features/diff/DiffViewer";
import { CommitChangesPanel } from "../features/history/CommitChangesPanel";
import { CommitGraph } from "../features/history/CommitGraph";
import { CommitMenu } from "../features/history/CommitMenu";
import { GraphFilterDialog } from "../features/history/GraphFilterDialog";
import { ManageReferencesDialog } from "../features/references/ManageReferencesDialog";
import { ReferenceSidebar } from "../features/references/ReferenceSidebar";
import { MissingRepository } from "../features/repositories/MissingRepository";
import { RepositoryHome } from "../features/repositories/RepositoryHome";
import { RepositoryOverview } from "../features/repositories/RepositoryOverview";
import { StashesDialog } from "../features/stashes/StashesDialog";
import { RemotesDialog } from "../features/sync/RemotesDialog";
import { HistoryRecoveryDialog } from "../features/workflows/HistoryRecoveryDialog";
import { UndoRedoDialog } from "../features/workflows/UndoRedoDialog";
import { useAppStore } from "../stores/app-store";
import { useLayoutStore, type PanelId } from "../stores/layout-store";
import { useRepositoryStore } from "../stores/repository-store";
import { GlobalGitWarning } from "./GlobalGitWarning";

const PANELS: readonly PanelId[] = ["graph", "diff", "rail"];

export function Workspace({ onReviewGitSettings }: { onReviewGitSettings: () => void }) {
  return (
    <LayoutTransition className="h-full min-h-0">
      <WorkspaceContent onReviewGitSettings={onReviewGitSettings} />
    </LayoutTransition>
  );
}

function WorkspaceContent({ onReviewGitSettings }: { onReviewGitSettings: () => void }) {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1100);
  const [drawer, setDrawer] = useState<{ owner: string; kind: "references" | "commit" } | null>(
    null,
  );
  const repositories = useAppStore((state) => state.repositories);
  const selectedId = useAppStore((state) => state.selectedRepositoryId);
  const active = useAppStore((state) => state.activeIdentity);
  const phase = useRepositoryStore((state) =>
    state.repositoryId === selectedId && state.identityId === active?.id ? state.phase : "loading",
  );
  const loading = phase === "loading" || phase === "idle";
  const error = useRepositoryStore((state) => state.error);
  const commandDialog = useRepositoryStore((state) =>
    state.repositoryId === selectedId && state.identityId === active?.id
      ? state.commandDialog
      : null,
  );
  const closeCommand = () => useRepositoryStore.setState({ commandDialog: null });
  const watchWarning = useRepositoryStore((state) => state.watchWarning);
  const writeUnavailable = useRepositoryStore((state) =>
    state.status?.capabilities?.write === false ? state.status.capabilities.reason : undefined,
  );
  const open = useRepositoryStore((state) => state.open);
  const refresh = useRepositoryStore((state) => state.refresh);
  const [graphVisible, diffVisible, railVisible] = useLayoutStore(
    useShallow((state) => PANELS.map(state.isVisible)),
  );
  const graphPanel = usePanel("graph");
  const diffPanel = usePanel("diff");
  const railPanel = usePanel("rail");
  const contentView = useRepositoryStore((state) => state.contentView);
  const selection = useRepositoryStore((state) => state.selection);
  const showingDiff = !loading && contentView === "diff";
  const inspectingCommit = !loading && selection?.kind === "commit";
  const contentVisible = showingDiff ? diffVisible : graphVisible;
  const contentPanel = showingDiff ? diffPanel : graphPanel;
  const changeCount = useRepositoryStore((state) => state.status?.changes.length);
  const selected = repositories.find((repository) => repository.id === selectedId);
  const owner = `${active?.id}:${selectedId}`;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1099px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!selected || !active) {
      useRepositoryStore.getState().clear();
      return;
    }
    void open(selected.id, active.id, selected.available);
  }, [active, open, selected]);

  if (!selected) {
    return <RepositoryHome />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {drawer?.owner === owner && (
        <Dialog
          placement="right"
          title={
            drawer.kind === "references"
              ? t("workspace.branchesAndTags")
              : t("workspace.commitDraft")
          }
          onClose={() => setDrawer(null)}
          footer={
            <Button variant="quiet" onClick={() => setDrawer(null)}>
              {t("workspace.closeDrawer")}
            </Button>
          }
        >
          {drawer.kind === "references" ? (
            <div className="mt-4 h-[70vh]">
              <ReferenceSidebar
                repositoryId={selected.id}
                forceExpanded
                onExpand={() => setDrawer(null)}
              />
            </div>
          ) : (
            <CommitBox key={owner} />
          )}
        </Dialog>
      )}
      {commandDialog?.kind === "repository.graph" && (
        <GraphFilterDialog
          key={`${active?.id}:${selected.id}`}
          repositoryId={selected.id}
          onClose={closeCommand}
        />
      )}
      {commandDialog?.kind === "repository.references" && (
        <ManageReferencesDialog
          key={`${active?.id}:${selected.id}`}
          repositoryId={selected.id}
          onClose={closeCommand}
        />
      )}
      {commandDialog?.kind === "repository.stashes" && (
        <StashesDialog key={owner} repositoryId={selected.id} onClose={closeCommand} />
      )}
      {commandDialog?.kind === "repository.remotes" && (
        <RemotesDialog
          key={`${active?.id}:${selected.id}`}
          repositoryId={selected.id}
          onClose={closeCommand}
        />
      )}
      {commandDialog?.kind === "repository.recovery" && (
        <DiscardDialog
          key={`${active?.id}:${selected.id}`}
          repositoryId={selected.id}
          paths={null}
          onClose={closeCommand}
        />
      )}
      {commandDialog?.kind === "repository.historyRecovery" && (
        <HistoryRecoveryDialog key={owner} repositoryId={selected.id} onClose={closeCommand} />
      )}
      {commandDialog?.kind === "repository.undoRedo" && (
        <UndoRedoDialog key={owner} repositoryId={selected.id} onClose={closeCommand} />
      )}
      {commandDialog?.oid &&
        (commandDialog.kind === "repository.createBranch" ||
          commandDialog.kind === "repository.createTag") && (
          <CommitMenu
            key={`${active?.id}:${selected.id}`}
            target={{ oid: commandDialog.oid, x: window.innerWidth / 2 - 120, y: 100 }}
            initialMode={commandDialog.kind === "repository.createBranch" ? "branch" : "tag"}
            onClose={closeCommand}
          />
        )}
      {phase === "missing" && <MissingRepository key={selected.id} repository={selected} />}
      {phase === "error" && (
        <WorkspaceState
          title={t("workspace.repositoryCouldNotBeRead")}
          detail={errorMessage(error, errorText("workspace.anUnexpectedReadErrorOccurred"))}
          action={() => void refresh()}
        />
      )}
      {(loading || phase === "ready") && (
        <>
          <RepositoryOverview
            pending={loading}
            key={owner}
            repository={selected}
            {...(!railVisible && { onOpenCommit: () => setDrawer({ owner, kind: "commit" }) })}
          />
          <GlobalGitWarning onReview={onReviewGitSettings} />
          {!loading && watchWarning && (
            <p role="status" className="px-3 py-1 text-xs text-git-modified">
              {watchWarning}
            </p>
          )}
          {!loading && writeUnavailable && (
            <p role="status" className="px-3 py-1 text-xs text-git-modified">
              {writeUnavailable}
            </p>
          )}
          <div className="flex min-h-0 flex-1">
            <ReferenceSidebar
              key={`${active?.id}:${selected.id}`}
              repositoryId={selected.id}
              compact={narrow}
              pending={loading}
              onExpand={() => setDrawer({ owner, kind: "references" })}
            />
            <Split
              direction="horizontal"
              className="flex-1"
              storageKey="eda.layout.rail"
              label={t("workspace.resizeTheWorkingTreePanel")}
              defaultFraction={0.73}
              minFirst={340}
              minSecond={260}
              collapsed={!contentVisible ? "first" : railVisible ? undefined : "second"}
              first={
                <CollapsiblePanel
                  collapsed={!contentVisible}
                  name={showingDiff ? t("workspace.diffViewer") : t("workspace.history")}
                  onExpand={contentPanel.toggleCollapse}
                >
                  <div className="h-full w-full" hidden={showingDiff} inert={showingDiff}>
                    <CommitGraph key={owner} pending={loading} />
                  </div>
                  <div className="h-full w-full" hidden={!showingDiff} inert={!showingDiff}>
                    {showingDiff && <DiffViewer key={owner} />}
                  </div>
                </CollapsiblePanel>
              }
              second={
                <CollapsiblePanel
                  collapsed={!railVisible}
                  name={inspectingCommit ? t("workspace.fileChanges") : t("workspace.workingTree")}
                  onExpand={railPanel.toggleCollapse}
                  badge={changeCount ? String(changeCount) : undefined}
                >
                  <div className="app-canvas flex h-full min-h-0 w-full flex-col border-l border-border-subtle bg-bg-surface">
                    {inspectingCommit ? (
                      <CommitChangesPanel key={owner} />
                    ) : (
                      <>
                        <div className="min-h-0 flex-1">
                          <ChangesPanel key={owner} pending={loading} />
                        </div>
                        <CommitBox key={owner} pending={loading} />
                      </>
                    )}
                  </div>
                </CollapsiblePanel>
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

function WorkspaceState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-[42ch] text-center">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-text-tertiary">{detail}</p>
        {action && (
          <Button variant="secondary" className="mt-4" onClick={action}>
            {t("workspace.tryAgain")}
          </Button>
        )}
      </div>
    </div>
  );
}
