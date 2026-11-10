import { t } from "@shared/i18n";
import { defaultGraphColumns, type GraphColumn } from "@shared/preferences/graph-view";
import {
  ArrowLeftIcon as ArrowLeft,
  ArrowRightIcon as ArrowRight,
} from "../../components/ui/icons";
import { useSessionStore } from "../../stores/session-store";
import { Button, Dialog, Checkbox, IconButton, Slider } from "../../components/ui/index";

export function GraphColumnsDialog({
  repositoryId,
  columns,
  onClose,
}: {
  repositoryId: string;
  columns: GraphColumn[];
  onClose: () => void;
}) {
  const save = (next: GraphColumn[]) =>
    useSessionStore.getState().setView(repositoryId, { graphColumns: next });
  const update = (index: number, change: Partial<GraphColumn>) =>
    save(
      columns.map((column, position) => (position === index ? { ...column, ...change } : column)),
    );
  const move = (index: number, direction: number) => {
    const next = [...columns];
    const other = index + direction;
    [next[index], next[other]] = [next[other]!, next[index]!];
    save(next);
  };

  return (
    <Dialog
      title={t("graphColumnsDialog.historyColumns")}
      description={t("graphColumnsDialog.commitMessagesAndReferenceLabelsStayVisibleThese")}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="quiet"
            onClick={() =>
              save(
                defaultGraphColumns().map((column) => ({
                  ...column,
                  visible: column.id === "sha",
                  width: 64,
                })),
              )
            }
          >
            {t("graphColumnsDialog.compactColumns")}
          </Button>
          <Button variant="quiet" onClick={() => save(defaultGraphColumns())}>
            {t("graphColumnsDialog.resetColumns")}
          </Button>
          <Button onClick={onClose}>{t("common.done")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {columns.map((column, index) => (
          <div key={column.id} className="flex items-center gap-3 text-sm">
            <Checkbox
              className="flex w-24 items-center gap-2 capitalize"
              checked={column.visible}
              onChange={(event) => update(index, { visible: event.target.checked })}
            >
              {column.id}
            </Checkbox>
            <Slider
              aria-label={t("graphColumnsDialog.columnWidth", { id: column.id })}
              min={48}
              max={320}
              step={8}
              value={column.width}
              className="min-w-0 flex-1"
              onChange={(event) => update(index, { width: Number(event.target.value) })}
            />
            <span className="w-10 text-xs">
              {t("graphColumnsDialog.px", { width: column.width })}
            </span>
            <IconButton
              size="xs"
              disabled={!index}
              aria-label={t("graphColumnsDialog.moveColumnLeft", { id: column.id })}
              onClick={() => move(index, -1)}
              icon={<ArrowLeft size={14} aria-hidden="true" />}
            />
            <IconButton
              size="xs"
              disabled={index === columns.length - 1}
              aria-label={t("graphColumnsDialog.moveColumnRight", { id: column.id })}
              onClick={() => move(index, 1)}
              icon={<ArrowRight size={14} aria-hidden="true" />}
            />
          </div>
        ))}
      </div>
    </Dialog>
  );
}
