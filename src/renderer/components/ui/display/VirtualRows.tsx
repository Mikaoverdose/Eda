import { t } from "@shared/i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";

export const MAX_RENDERED_ROWS = 80;
const scrollPositions = new Map<string, number>();

export interface VirtualRange {
  start: number;
  end: number;
}

export function getVirtualRange(
  count: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan = 8,
): VirtualRange {
  const visible = Math.ceil(viewportHeight / rowHeight);
  const start = Math.min(count, Math.max(0, Math.floor(scrollTop / rowHeight) - overscan));
  const end = Math.min(count, start + Math.min(MAX_RENDERED_ROWS, visible + overscan * 2));
  return { start, end };
}

export function VirtualRows<T>({
  items,
  rowHeight,
  renderRow,
  className = "",
  onNearEnd,
  onNearStart,
  itemOffset = 0,
  totalCount = items.length,
  horizontalScroll = true,
  revealIndex,
  scrollKey,
  ariaLabel = t("virtualRows.scrollableRows"),
}: {
  items: readonly T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
  onNearEnd?: () => void;
  onNearStart?: () => void;
  itemOffset?: number;
  totalCount?: number;
  horizontalScroll?: boolean;
  revealIndex?: number | undefined;
  scrollKey?: string | undefined;
  ariaLabel?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const lastScroll = useRef(0);
  const restoredScroll = useRef(false);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 500 });
  const range = getVirtualRange(totalCount, viewport.scrollTop, viewport.height, rowHeight);
  const retainedStart = Math.min(itemOffset + items.length, Math.max(range.start, itemOffset));
  const retainedEnd = Math.max(retainedStart, Math.min(range.end, itemOffset + items.length));

  useEffect(() => {
    const element = container.current;

    if (!element) return;

    restoredScroll.current = !!scrollKey && scrollPositions.has(scrollKey);

    if (scrollKey) element.scrollTop = scrollPositions.get(scrollKey) ?? 0;

    lastScroll.current = element.scrollTop;

    const update = () =>
      setViewport({ scrollTop: element.scrollTop, height: element.clientHeight });

    update();

    const observer = new ResizeObserver(update);

    observer.observe(element);

    return () => {
      observer.disconnect();
      if (scrollKey) {
        scrollPositions.delete(scrollKey);
        scrollPositions.set(scrollKey, lastScroll.current);
        if (scrollPositions.size > 64) scrollPositions.delete(scrollPositions.keys().next().value!);
      }
    };
  }, [scrollKey]);

  useEffect(() => {
    if (range.end >= itemOffset + items.length - 8) onNearEnd?.();
    if (range.start <= itemOffset + 8) onNearStart?.();
  }, [itemOffset, items.length, onNearEnd, onNearStart, range.end, range.start]);

  useEffect(() => {
    const element = container.current;

    if (restoredScroll.current) {
      restoredScroll.current = false;
      return;
    }

    if (!element || revealIndex === undefined || revealIndex < 0) return;

    const top = revealIndex * rowHeight;

    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + rowHeight > element.scrollTop + element.clientHeight)
      element.scrollTop = top + rowHeight - element.clientHeight;
  }, [revealIndex, rowHeight]);

  return (
    <div
      ref={container}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      data-virtual-list="true"
      data-mounted-count={Math.max(0, retainedEnd - retainedStart)}
      data-retained-count={items.length}
      data-total-count={totalCount}
      data-item-offset={itemOffset}
      className={`ui-scroll-region relative overflow-auto ${className}`}
      onScroll={(event) => {
        lastScroll.current = event.currentTarget.scrollTop;
        setViewport({
          scrollTop: event.currentTarget.scrollTop,
          height: event.currentTarget.clientHeight,
        });
      }}
    >
      <div
        className="relative min-w-full"
        style={{ height: totalCount * rowHeight, width: horizontalScroll ? "max-content" : "100%" }}
      >
        <div
          className="absolute left-0 top-0 min-w-full"
          style={{
            transform: `translateY(${retainedStart * rowHeight}px)`,
            ...(horizontalScroll ? {} : { width: "100%" }),
          }}
        >
          {items
            .slice(retainedStart - itemOffset, retainedEnd - itemOffset)
            .map((item, offset) => renderRow(item, retainedStart + offset))}
        </div>
      </div>
    </div>
  );
}
