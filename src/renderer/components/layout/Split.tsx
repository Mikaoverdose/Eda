import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../ui/cx";
import { fractionFromPosition, resolveSplit } from "./split-math";
import { useSessionStore } from "../../stores/session-store";

const DIVIDER = 5;
const KEYBOARD_STEP = 24;

export function Split({
  direction,
  first,
  second,
  defaultFraction = 0.5,
  minFirst = 140,
  minSecond = 140,
  storageKey,
  label,
  className = "",
  collapsed,
  persist = true,
}: {
  direction: "horizontal" | "vertical";
  first: ReactNode;
  second: ReactNode;
  defaultFraction?: number;
  minFirst?: number;
  minSecond?: number;
  storageKey: string;
  label: string;
  className?: string;
  persist?: boolean;
  collapsed?: "first" | "second" | undefined;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [extent, setExtent] = useState(0);
  const repositoryId = useSessionStore((state) => state.snapshot?.session.selectedRepositoryId);
  const savedFraction = useSessionStore((state) =>
    persist && repositoryId
      ? state.snapshot?.session.views[repositoryId]?.splits[storageKey]
      : undefined,
  );
  const [dragFraction, setFraction] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const fraction =
    (dragging || !persist) && dragFraction !== null
      ? dragFraction
      : (savedFraction ?? defaultFraction);

  const isHorizontal = direction === "horizontal";
  const total = Math.max(0, extent - DIVIDER);
  const bounds = { total, minFirst, minSecond };
  const firstSize = resolveSplit(fraction, bounds);

  const fractionRef = useRef(fraction);

  fractionRef.current = fraction;

  const firstPaneBasis =
    collapsed === "first"
      ? "var(--panel-rail-size)"
      : collapsed === "second"
        ? "calc(100% - var(--panel-rail-size))"
        : `calc((100% - ${DIVIDER}px) * ${total > 0 ? firstSize / total : defaultFraction})`;

  useEffect(() => {
    const element = container.current;

    if (!element) return;

    const measure = () => setExtent(isHorizontal ? element.clientWidth : element.clientHeight);

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(element);

    return () => observer.disconnect();
  }, [isHorizontal]);

  const commit = useCallback(
    (next: number) => {
      setFraction(next);

      const store = useSessionStore.getState();

      if (
        persist &&
        repositoryId &&
        store.snapshot?.session.selectedRepositoryId === repositoryId
      ) {
        store.setView(repositoryId, {
          splits: { ...store.snapshot.session.views[repositoryId]?.splits, [storageKey]: next },
        });
      }
    },
    [storageKey, repositoryId, persist],
  );

  useEffect(() => {
    if (!dragging) return;

    const element = container.current;

    if (!element) return;

    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const position = isHorizontal ? event.clientX - rect.left : event.clientY - rect.top;
      setFraction(fractionFromPosition(position, { total, minFirst, minSecond }));
    };
    const end = () => {
      setDragging(false);
      commit(fractionRef.current);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [commit, dragging, isHorizontal, minFirst, minSecond, total]);

  const nudge = (delta: number) => {
    if (total <= 0) return;
    commit(fractionFromPosition(firstSize + delta, bounds));
  };

  return (
    <div
      ref={container}
      data-dragging={dragging}
      className={cx(
        "panel-split flex min-h-0 min-w-0",
        isHorizontal ? "flex-row" : "flex-col",
        className,
      )}
    >
      <div
        className="panel-split-pane flex min-h-0 min-w-0 overflow-hidden"
        style={{
          flex: `0 0 ${firstPaneBasis}`,
        }}
      >
        {first}
      </div>

      <div
        role="separator"
        aria-orientation={isHorizontal ? "vertical" : "horizontal"}
        aria-label={label}
        aria-valuenow={total > 0 ? Math.round((firstSize / total) * 100) : 50}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={collapsed ? -1 : 0}
        aria-hidden={!!collapsed}
        inert={!!collapsed}
        onPointerDown={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onKeyDown={(event) => {
          const back = isHorizontal ? "ArrowLeft" : "ArrowUp";
          const forward = isHorizontal ? "ArrowRight" : "ArrowDown";
          if (event.key === back) nudge(-KEYBOARD_STEP);
          else if (event.key === forward) nudge(KEYBOARD_STEP);
          else return;
          event.preventDefault();
        }}
        className={cx(
          "panel-split-divider group relative shrink-0 bg-border-subtle",
          "focus-visible:outline-none focus-visible:bg-accent",
          isHorizontal ? "cursor-col-resize" : "cursor-row-resize",
          dragging ? "bg-accent" : "hover:bg-accent-border",
        )}
        style={{ flexBasis: collapsed ? 0 : DIVIDER }}
      />

      <div className="flex min-h-0 min-w-0 overflow-hidden" style={{ flex: "1 1 0" }}>
        {second}
      </div>
    </div>
  );
}
