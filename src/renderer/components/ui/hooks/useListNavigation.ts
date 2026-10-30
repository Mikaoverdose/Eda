import { useState, type KeyboardEvent } from "react";

export function useListNavigation(
  count: number,
  onSelect: (index: number) => void,
  onMove?: (index: number) => void,
) {
  const [highlight, setHighlight] = useState(0);
  const index = Math.min(highlight, Math.max(0, count - 1));
  const move = (next: number) => {
    const position = Math.max(0, Math.min(count - 1, next));
    setHighlight(position);
    onMove?.(position);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing || count === 0) return;

    const next =
      event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : null;

    if (next !== null) {
      event.preventDefault();
      move(next);
    } else if (event.key === "Enter") {
      event.preventDefault();
      onSelect(index);
    }
  };

  return { index, setHighlight, onKeyDown };
}
