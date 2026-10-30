import type { DiffMode } from "@shared/repository/repository-read";
import { t } from "@shared/i18n";
import { LoadingContent } from "../../components/ui/feedback/Skeleton";
import { ErrorDialog, SegmentedControl, TextButton, StateMessage } from "../../components/ui/index";
import { useEffect, useState } from "react";
import { useAppStore } from "../../stores/app-store";
import { usePreferencesStore } from "../../stores/preferences-store";
import { useRepositoryStore } from "../../stores/repository-store";
import { PanelControls } from "../../components/layout/PanelControls";
import { usePanel } from "../../components/layout/hooks/usePanel";
import { DiffContent } from "./DiffContent";
import { PartialStageProvider } from "../changes/PartialStageControls";
import { IgnoreDialog } from "../changes/IgnoreDialog";
import { isImagePath } from "@shared/repository/image-preview";
import { ImageDiff } from "./ImageDiff";

export function DiffViewer({ pending = false }: { pending?: boolean }) {
  const [ignorePath, setIgnorePath] = useState<string | null>(null);
  const diff = useRepositoryStore((state) => state.diff);
  const loading = useRepositoryStore((state) =>
    state.selection?.kind === "commit" ? state.commitFileLoading : state.diffLoading,
  );
  const selection = useRepositoryStore((state) => state.selection);
  const error = useRepositoryStore((state) =>
    state.selection?.kind === "commit" ? state.commitFileError : state.error,
  );
  const commitFileDiff = useRepositoryStore((state) => state.commitFileDiff);
  const commitFilePath = useRepositoryStore((state) => state.commitFilePath);
  const showHistory = useRepositoryStore((state) => state.showHistory);
  const profileId = useAppStore((state) => state.activeIdentity?.id);
  const repositoryId = useAppStore((state) => state.selectedRepositoryId);

  useEffect(() => {
    setIgnorePath(null);
  }, [repositoryId, profileId]);

  const mode = usePreferencesStore((state) => state.values.diffMode.value);

  useEffect(() => {
    if (profileId && repositoryId)
      void usePreferencesStore.getState().load({ profileId, repositoryId });
  }, [profileId, repositoryId]);

  const setMode = (value: DiffMode) => {
    if (profileId && repositoryId)
      void usePreferencesStore
        .getState()
        .set("diffMode", { kind: "repository", profileId, repositoryId }, value);
  };

  const panel = usePanel("diff");
  const displayedDiff = selection?.kind === "commit" ? commitFileDiff : diff;
  const imageFile =
    displayedDiff?.files.length === 1 &&
    isImagePath(displayedDiff.files[0]?.newPath ?? displayedDiff.files[0]?.oldPath ?? "")
      ? displayedDiff.files[0]
      : undefined;

  if (pending || !selection) {
    return (
      <section
        data-tour="diff"
        className="app-surface-panel flex h-full w-full min-h-0 min-w-0 flex-col border-l border-border-subtle"
      >
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
          <TextButton onClick={showHistory} aria-label={t("diffViewer.backToHistory")}>
            {t("diffViewer.backToHistory")}
          </TextButton>
          <h3 className="text-sm font-semibold text-text-secondary">
            {t("diffViewer.diffViewer")}
          </h3>
          <span className="ml-auto" />
          <PanelControls
            name={t("diffViewer.diffViewerLabel")}
            state={panel.state}
            onToggleMaximize={panel.toggleMaximize}
            onToggleCollapse={panel.toggleCollapse}
            collapseDirection="down"
          />
        </header>
        {pending ? (
          <LoadingContent label={t("diffViewer.loadingDiff")} />
        ) : (
          <StateMessage
            className="min-h-0 flex-1"
            title={t("diffViewer.selectACommitOrFile")}
            description={t("diffViewer.itsChangesWillAppearHere")}
          />
        )}
      </section>
    );
  }

  return (
    <PartialStageProvider
      key={`${profileId}:${repositoryId}:${selection.kind === "commit" ? `${selection.oid}:${commitFilePath}` : `${selection.area}:${selection.path}`}`}
    >
      <section
        data-tour="diff"
        className="app-surface-panel flex h-full w-full min-h-0 min-w-0 flex-col border-l border-border-subtle"
      >
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
          <TextButton onClick={showHistory} aria-label={t("diffViewer.backToHistory")}>
            {t("diffViewer.backToHistory")}
          </TextButton>
          <h3 className="sr-only">{t("diffViewer.diffViewer")}</h3>
          <div className="min-w-0 flex-1 truncate text-xs font-medium text-text-secondary">
            {selection.kind === "change"
              ? `${selection.area === "staged" ? t("diffViewer.staged") : t("diffViewer.workingTree")}, ${selection.path}`
              : t("diffViewer.commit", {
                  oid: selection.oid.slice(0, 8),
                  value2: commitFilePath ?? "",
                })}
          </div>
          {!imageFile && (
            <SegmentedControl
              label={t("diffViewer.diffLayout")}
              value={mode}
              options={[
                { value: "unified", label: t("diffViewer.unified") },
                { value: "split", label: t("diffViewer.sideBySide") },
              ]}
              onChange={setMode}
            />
          )}
          {selection.kind === "change" && (
            <TextButton onClick={() => setIgnorePath(selection.path)}>
              {t("diffViewer.ignore")}
            </TextButton>
          )}
          <PanelControls
            name={t("diffViewer.diffViewerLabel")}
            state={panel.state}
            onToggleMaximize={panel.toggleMaximize}
            onToggleCollapse={panel.toggleCollapse}
            collapseDirection="down"
          />
        </header>
        {ignorePath && repositoryId && (
          <IgnoreDialog
            key={`${repositoryId}:${ignorePath}`}
            repositoryId={repositoryId}
            path={ignorePath}
            onClose={() => setIgnorePath(null)}
          />
        )}
        {loading ? (
          <LoadingContent label={t("diffViewer.loadingDiff")} />
        ) : error ? (
          <ErrorDialog
            title={t("diffViewer.couldNotLoadChanges")}
            actions={
              selection.kind === "commit" && commitFilePath ? (
                <TextButton
                  onClick={() =>
                    void useRepositoryStore.getState().selectCommitFile(commitFilePath)
                  }
                >
                  {t("diffViewer.retryFileDiff")}
                </TextButton>
              ) : undefined
            }
          >
            {error.message}
          </ErrorDialog>
        ) : !displayedDiff || displayedDiff.files.length === 0 ? (
          <StateMessage className="min-h-0 flex-1" title={t("diffViewer.noTextualChanges")} />
        ) : imageFile ? (
          <ImageDiff
            key={`${profileId}:${repositoryId}:${selection.kind === "commit" ? selection.oid : selection.area}:${imageFile.newPath ?? imageFile.oldPath}`}
            file={imageFile}
            revision={displayedDiff}
          />
        ) : (
          <DiffContent
            key={`${profileId}:${repositoryId}:${selection.kind === "commit" ? `${selection.oid}:${commitFilePath}` : `${selection.area}:${selection.path}`}`}
            diff={displayedDiff}
            mode={mode}
            readOnly={selection.kind === "commit"}
          />
        )}
      </section>
    </PartialStageProvider>
  );
}
