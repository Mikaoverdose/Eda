import { useEffect, useRef, type RefObject } from "react";

export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
  returnFocusRef?: RefObject<HTMLElement | null>,
): void {
  const dismiss = useRef(onDismiss);

  dismiss.current = onDismiss;

  useEffect(() => {
    if (!active) return;

    const opener =
      returnFocusRef?.current ??
      ref.current?.querySelector<HTMLElement>("[aria-haspopup]") ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
      if (!ref.current?.contains(event.target as Node)) dismiss.current();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.contains(event.target as Node)) {
        event.preventDefault();
        dismiss.current();
        opener?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ref, active, returnFocusRef]);
}
