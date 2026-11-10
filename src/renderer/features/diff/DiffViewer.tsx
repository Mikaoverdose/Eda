import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { isImagePath } from "@shared/repository/image-preview";
import type { DiffMode } from "@shared/repository/repository-read";
import { ArrowLeft, Columns2, EyeOff, Rows3 } from "lucide-react";
import { useEffect, useState } from "react";
import { PanelHeader } from "../../components/layout/PanelHeader";
import { usePanel } from "../../components/layout/hooks/usePanel";
import { LoadingContent } from "../../components/ui/feedback/Skeleton";
import { ErrorDialog, IconButton, StateMessage, TextButton } from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";
import { usePreferencesStore } from "../../stores/preferences-store";
import { useRepositoryStore } from "../../stores/repository-store";
import { IgnoreDialog } from "../changes/IgnoreDialog";
import { PartialStageProvider, PartialStageToolbar } from "../changes/PartialStageControls";
import { DiffContent } from "./DiffContent";
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

  const empty = pending || !selection;
  const path = selection?.kind === "change" ? selection.path : commitFilePath;
  const fileName = path?.split("/").at(-1);

  const source =
    selection?.kind === "change"
      ? selection.area === "staged"
        ? t("diffViewer.staged")
        : t("diffViewer.workingTree")
      : selection
        ? t("diffViewer.commitSource", { oid: selection.oid.slice(0, 8) })
        : "";

  const selectionKey =
    selection?.kind === "commit"
      ? `${selection.oid}:${commitFilePath}`
      : selection
        ? `${selection.area}:${selection.path}`
        : "";

  const contentKey = `${profileId}:${repositoryId}:${selectionKey}`;

  return (
    <PartialStageProvider key={empty ? "empty" : contentKey} disabled={empty}>
      <section
        data-tour="diff"
        className="app-surface-panel @container/diff flex h-full w-full min-h-0 min-w-0 flex-col border-l border-border-subtle"
      >
        <PanelHeader
          label={t("diffViewer.diffViewer")}
          title={
            empty ? (
              t("diffViewer.diffViewer")
            ) : (
              <span title={`${source}: ${path ?? ""}`}>{fileName ?? source}</span>
            )
          }
          controls={{
            name: t("diffViewer.diffViewerLabel"),
            state: panel.state,
            onToggleMaximize: panel.toggleMaximize,
            onToggleCollapse: panel.toggleCollapse,
            collapseDirection: "down",
          }}
          leading={
            <IconButton
              size="xs"
              onClick={showHistory}
              aria-label={t("diffViewer.backToHistory")}
              title={t("diffViewer.backToHistory")}
              icon={<ArrowLeft size={14} aria-hidden="true" />}
            />
          }
        >
          {!empty && fileName && (
            <span className="hidden min-w-0 truncate text-xs text-text-tertiary @min-[600px]/diff:inline">
              {source}
            </span>
          )}

          <span className="ml-auto" />

          {!empty && !imageFile && (
            <div
              role="group"
              data-tour="diff-layout"
              aria-label={t("diffViewer.diffLayout")}
              className="flex shrink-0 gap-0.5"
            >
              <IconButton
                size="xs"
                aria-label={t("diffViewer.unified")}
                title={t("diffViewer.unified")}
                aria-pressed={mode === "unified"}
                className={mode === "unified" ? "bg-accent-muted text-accent-text" : undefined}
                onClick={() => setMode("unified")}
                icon={<Rows3 size={14} aria-hidden="true" />}
              />

              <IconButton
                size="xs"
                aria-label={t("diffViewer.sideBySide")}
                title={t("diffViewer.sideBySide")}
                aria-pressed={mode === "split"}
                className={mode === "split" ? "bg-accent-muted text-accent-text" : undefined}
                onClick={() => setMode("split")}
                icon={<Columns2 size={14} aria-hidden="true" />}
              />
            </div>
          )}

          {!empty && selection?.kind === "change" && (
            <IconButton
              size="xs"
              aria-label={t("diffViewer.ignore")}
              title={t("diffViewer.ignore")}
              onClick={() => setIgnorePath(selection.path)}
              icon={<EyeOff size={14} aria-hidden="true" />}
            />
          )}
        </PanelHeader>

        {!empty && <PartialStageToolbar fileOnly={!!imageFile} />}

        {!empty && ignorePath && repositoryId && (
          <IgnoreDialog
            key={`${repositoryId}:${ignorePath}`}
            repositoryId={repositoryId}
            path={ignorePath}
            onClose={() => setIgnorePath(null)}
          />
        )}

        {pending || (!empty && loading) ? (
          <LoadingContent label={t("diffViewer.loadingDiff")} />
        ) : empty ? (
          <StateMessage
            className="min-h-0 flex-1"
            title={t("diffViewer.selectACommitOrFile")}
            description={t("diffViewer.itsChangesWillAppearHere")}
          />
        ) : error ? (
          <ErrorDialog
            title={t("diffViewer.couldNotLoadChanges")}
            actions={
              selection?.kind === "commit" && commitFilePath ? (
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
            {errorMessage(error)}
          </ErrorDialog>
        ) : !displayedDiff || displayedDiff.files.length === 0 ? (
          <StateMessage className="min-h-0 flex-1" title={t("diffViewer.noTextualChanges")} />
        ) : imageFile ? (
          <ImageDiff key={contentKey} file={imageFile} revision={displayedDiff} />
        ) : (
          <DiffContent
            key={contentKey}
            diff={displayedDiff}
            mode={mode}
            readOnly={selection?.kind === "commit"}
          />
        )}
      </section>
    </PartialStageProvider>
  );
}
