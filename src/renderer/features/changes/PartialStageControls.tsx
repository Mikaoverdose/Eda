import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { PartialStagePreview, PartialStageRequest } from "@shared/repository/partial-stage";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Button,
  CheckboxControl,
  CodeBlock,
  Dialog,
  ErrorDialog,
  TextButton,
} from "../../components/ui/index";
import type { UnifiedRow } from "../../repository/diff-model";
import { useRepositoryStore } from "../../stores/repository-store";
import { DiscardDialog } from "./DiscardDialog";

const Context = createContext<{
  selected: ReadonlySet<string>;
  toggle: (key: string) => void;
  hunk: (index: number) => void;
  discard: ((index?: number) => void) | null;
  busy: boolean;
  verb: string;
  error: string | null;
  prepareSelected: () => void;
  clearSelected: () => void;
  discardSelected: (() => void) | null;
} | null>(null);

export function PartialStageProvider({
  children,
  disabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  const repositoryId = useRepositoryStore((state) => state.repositoryId);
  const selection = useRepositoryStore((state) => state.selection);
  const writing = useRepositoryStore((state) => state.writing);
  const diff = useRepositoryStore((state) => state.diff);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [preview, setPreview] = useState<PartialStagePreview | null>(null);
  const [discard, setDiscard] = useState<{ request: PartialStageRequest; paths: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const preparing = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected((current) => (current.size ? new Set() : current));
  }, [diff]);

  if (disabled || !repositoryId || selection?.kind !== "change" || selection.area === "conflicted")
    return <Context.Provider value={null}>{children}</Context.Provider>;

  const area = selection.area === "staged" ? "staged" : "unstaged";
  const verb =
    area === "staged" ? t("partialStageControls.unstage") : t("partialStageControls.stage");
  const prepareDiscard = (hunk?: number) =>
    setDiscard({
      paths: [selection.path],
      request: {
        repositoryId,
        path: selection.path,
        area: "unstaged",
        ...(hunk !== undefined
          ? { hunks: [hunk] }
          : {
              lines: [...selected].map((key) => {
                const [hunk, line] = key.split(":").map(Number);
                return { hunk: hunk!, line: line! };
              }),
            }),
      },
    });

  const prepare = async (hunks?: number[]) => {
    if (preparing.current || writing) return;

    preparing.current = true;

    const owner = useRepositoryStore.getState();

    setBusy(true);
    setError(null);

    try {
      const result = await window.eda.repository.previewPartial({
        repositoryId,
        path: selection.path,
        area,
        ...(hunks
          ? { hunks }
          : {
              lines: [...selected].map((key) => {
                const [hunk, line] = key.split(":").map(Number);
                return { hunk: hunk!, line: line! };
              }),
            }),
      });

      const current = useRepositoryStore.getState();

      if (
        !mounted.current ||
        current.repositoryId !== repositoryId ||
        current.identityId !== owner.identityId ||
        current.selection !== owner.selection ||
        current.diff !== owner.diff
      )
        return;

      if (!result.ok) setError(errorMessage(result.error));
      else if (hunks) {
        if (await current.applyPartial(result.value.token)) setSelected(new Set());
      } else setPreview(result.value);
    } catch {
      if (mounted.current)
        setError(t("partialStageControls.couldNotUpdateTheSelectedChangesTryAgain"));
    } finally {
      preparing.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const apply = async () => {
    if (!preview) return;

    setBusy(true);

    const token = preview.token;

    setPreview(null);

    try {
      if (await useRepositoryStore.getState().applyPartial(token)) setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Context.Provider
      value={{
        selected,
        busy: busy || writing,
        verb,
        toggle: (key) =>
          setSelected((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          }),
        hunk: (index) => void prepare([index]),
        discard: area === "unstaged" ? prepareDiscard : null,
        error,
        prepareSelected: () => void prepare(),
        clearSelected: () => setSelected(new Set()),
        discardSelected: area === "unstaged" ? () => prepareDiscard() : null,
      }}
    >
      {children}
      {discard && (
        <DiscardDialog
          repositoryId={repositoryId}
          paths={discard.paths}
          partial={discard.request}
          onClose={() => setDiscard(null)}
        />
      )}
      {preview && (
        <Dialog
          title={t("partialStageControls.selectedChanges", { verb: verb })}
          description={t("partialStageControls.reviewTheExactPatchThatWillUpdateThe")}
          onClose={() => setPreview(null)}
          footer={
            <>
              <Button variant="quiet" onClick={() => setPreview(null)}>
                {t("common.cancel")}
              </Button>
              <Button disabled={writing || busy} onClick={() => void apply()}>
                {t("partialStageControls.changes", { verb: verb })}
              </Button>
            </>
          }
        >
          <p className="mb-2 text-xs text-text-secondary">
            +{preview.additions} -{preview.deletions}
          </p>
          <CodeBlock label={t("partialStageControls.patchToApply")} className="max-h-[45vh]">
            {preview.patch}
          </CodeBlock>
        </Dialog>
      )}
    </Context.Provider>
  );
}

export function PartialStageToolbar() {
  const context = useContext(Context);

  if (!context) return null;

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-3 py-1 text-xs">
        <span className="text-text-tertiary">
          {context.selected.size
            ? t("partialStageControls.linesSelected", { size: context.selected.size })
            : t("partialStageControls.selectChangedLinesOrStageUnstageAHunk")}
        </span>
        <TextButton
          disabled={!context.selected.size || context.busy}
          className="ml-auto"
          tone="accent"
          onClick={context.prepareSelected}
        >
          {t("partialStageControls.selectedLines", { verb: context.verb })}
        </TextButton>
        {context.selected.size > 0 && (
          <TextButton onClick={context.clearSelected}>{t("partialStageControls.clear")}</TextButton>
        )}
        {context.discardSelected && context.selected.size > 0 && (
          <TextButton disabled={context.busy} tone="danger" onClick={context.discardSelected}>
            {t("partialStageControls.discardSelectedLines")}
          </TextButton>
        )}
      </div>
      {context.error && <ErrorDialog>{context.error}</ErrorDialog>}
    </>
  );
}

export function PartialLineControl({ row }: { row: UnifiedRow }) {
  const context = useContext(Context);

  if (!context || row.hunkIndex === undefined) return null;

  if (row.kind === "hunk")
    return (
      <>
        <TextButton
          disabled={context.busy}
          className="select-none shrink-0 px-2"
          tone="accent"
          aria-label={t("partialStageControls.hunkActionLabel", {
            verb: context.verb,
            value2: row.hunkIndex + 1,
          })}
          onClick={() => context.hunk(row.hunkIndex!)}
        >
          {t("partialStageControls.hunk", { verb: context.verb })}
        </TextButton>
        {context.discard && (
          <TextButton
            disabled={context.busy}
            className="select-none shrink-0 px-2"
            tone="danger"
            aria-label={t("partialStageControls.discardHunk", { value1: row.hunkIndex + 1 })}
            onClick={() => context.discard?.(row.hunkIndex)}
          >
            {t("partialStageControls.discard")}
          </TextButton>
        )}
      </>
    );

  if ((row.kind !== "addition" && row.kind !== "deletion") || row.lineIndex === undefined)
    return <span className="w-6 shrink-0" />;

  const key = `${row.hunkIndex}:${row.lineIndex}`;

  return (
    <span className="flex w-6 shrink-0 justify-center">
      <CheckboxControl
        aria-label={t("partialStageControls.selectLine", {
          value1:
            row.kind === "addition"
              ? t("partialStageControls.added")
              : t("partialStageControls.deleted"),
          value2: row.newLineNumber ?? row.oldLineNumber,
        })}
        checked={context.selected.has(key)}
        disabled={context.busy}
        onChange={() => context.toggle(key)}
      />
    </span>
  );
}
