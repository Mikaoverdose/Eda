import { useRef, useState } from "react";
import { t } from "@shared/i18n";
import { defaultGraphColumns, type GraphColumn } from "@shared/preferences/graph-view";
import {
  ArrowLeftIcon as ArrowLeft,
  ArrowRightIcon as ArrowRight,
} from "../../components/ui/icons";
import { useSessionStore } from "../../stores/session-store";
import { AnchoredPopover, Button, Checkbox, IconButton } from "../../components/ui/index";

export function GraphColumnsMenu({
  repositoryId,
  columns,
  disabled,
}: {
  repositoryId: string;
  columns: GraphColumn[];
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
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
    <>
      <Button
        size="sm"
        variant="ghost"
        ref={trigger}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t("commitGraph.columns")}
      </Button>

      {open && (
        <AnchoredPopover
          role="dialog"
          aria-label={t("graphColumns.historyColumns")}
          anchorRef={trigger}
          returnFocusRef={trigger}
          placement="bottom-end"
          onClose={() => setOpen(false)}
          className="w-64 space-y-3 p-3"
        >
          <p className="text-xs text-text-tertiary">{t("graphColumns.resizeHint")}</p>

          <div className="space-y-2">
            {columns.map((column, index) => (
              <div key={column.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  className="flex flex-1 items-center gap-2 capitalize"
                  checked={column.visible}
                  onChange={(event) => update(index, { visible: event.target.checked })}
                >
                  {column.id}
                </Checkbox>

                <IconButton
                  size="xs"
                  disabled={!index}
                  aria-label={t("graphColumns.moveColumnLeft", { id: column.id })}
                  onClick={() => move(index, -1)}
                  icon={<ArrowLeft size={14} aria-hidden="true" />}
                />

                <IconButton
                  size="xs"
                  disabled={index === columns.length - 1}
                  aria-label={t("graphColumns.moveColumnRight", { id: column.id })}
                  onClick={() => move(index, 1)}
                  icon={<ArrowRight size={14} aria-hidden="true" />}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-2">
            <Button
              size="sm"
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
              {t("graphColumns.compactColumns")}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => save(defaultGraphColumns())}>
              {t("graphColumns.resetColumns")}
            </Button>
          </div>
        </AnchoredPopover>
      )}
    </>
  );
}
