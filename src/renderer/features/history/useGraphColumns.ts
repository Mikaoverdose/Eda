import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  defaultGraphColumns,
  type GraphColumn,
  type GraphColumnId,
} from "@shared/preferences/graph-view";
import type { SessionContext } from "@shared/identity/profile-session";
import { useRepositoryStore } from "../../stores/repository-store";
import { useSessionStore } from "../../stores/session-store";

interface ColumnDrag {
  repositoryId: string;
  id: GraphColumnId;
  pointerId: number;
  target: HTMLElement;
  x: number;
  width: number;
  context: SessionContext;
}

const clampWidth = (width: number) => Math.max(48, Math.min(320, Math.round(width)));

export function useGraphColumns(repositoryId: string | null, disabled: boolean) {
  const savedColumns = useSessionStore((state) =>
    repositoryId ? state.snapshot?.session.views[repositoryId]?.graphColumns : undefined,
  );
  const context = useSessionStore((state) => state.snapshot?.context);
  const columns = savedColumns ?? defaultGraphColumns();
  const [drag, setDrag] = useState<ColumnDrag | null>(null);
  const [draftWidth, setDraftWidth] = useState(0);
  const width = useRef(0);

  const saveWidth = useCallback(
    (id: GraphColumnId, nextWidth: number) => {
      if (!repositoryId || disabled) return;

      const store = useSessionStore.getState();
      const latest =
        store.snapshot?.session.views[repositoryId]?.graphColumns ?? defaultGraphColumns();
      const next = clampWidth(nextWidth);

      if (latest.find((column) => column.id === id)?.width === next) return;

      store.setView(repositoryId, {
        graphColumns: latest.map((column) =>
          column.id === id ? { ...column, width: next } : column,
        ),
      });
    },
    [repositoryId, disabled],
  );

  useEffect(() => {
    if (!drag || !repositoryId) return;

    const current = () => {
      const store = useSessionStore.getState();
      const latest = store.snapshot?.context;

      return (
        repositoryId === drag.repositoryId &&
        !store.transitioning &&
        !store.snapshot?.recovery &&
        latest?.profileId === drag.context.profileId &&
        latest.windowId === drag.context.windowId &&
        latest.generation === drag.context.generation &&
        useRepositoryStore.getState().repositoryId === repositoryId
      );
    };

    if (disabled || !current()) {
      setDrag(null);
      return;
    }

    const move = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      if (!current()) {
        setDrag(null);
        return;
      }

      // Metadata columns are anchored to the right, so their left edge controls their width.
      width.current = clampWidth(drag.width + drag.x - event.clientX);
      setDraftWidth(width.current);
    };
    const end = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      if (current()) saveWidth(drag.id, width.current);
      setDrag(null);
    };
    const cancel = (event: PointerEvent) => {
      if (event.pointerId === drag.pointerId) setDrag(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDrag(null);
    };
    const blur = () => setDrag(null);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("lostpointercapture", cancel);
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", blur);

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", blur);

      if (drag.target.hasPointerCapture(drag.pointerId))
        drag.target.releasePointerCapture(drag.pointerId);
    };
  }, [
    drag,
    repositoryId,
    disabled,
    context?.profileId,
    context?.windowId,
    context?.generation,
    saveWidth,
  ]);

  const startResize = (column: GraphColumn, event: ReactPointerEvent<HTMLElement>) => {
    const store = useSessionStore.getState();
    const snapshot = store.snapshot;

    if (
      disabled ||
      drag ||
      event.button !== 0 ||
      !repositoryId ||
      !snapshot ||
      store.transitioning ||
      snapshot.recovery
    )
      return;

    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    width.current = column.width;
    setDraftWidth(column.width);
    setDrag({
      repositoryId,
      id: column.id,
      pointerId: event.pointerId,
      target: event.currentTarget,
      x: event.clientX,
      width: column.width,
      context: snapshot.context,
    });
  };

  return {
    columns: columns.map((column) =>
      drag?.id === column.id ? { ...column, width: draftWidth } : column,
    ),
    startResize,
    saveWidth,
    resizing: drag !== null,
  };
}
