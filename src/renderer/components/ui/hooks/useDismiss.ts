import { useEffect, useRef, type RefObject } from "react";

export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
  returnFocusRef?: RefObject<HTMLElement | null>,
  triggerRef?: RefObject<HTMLElement | null>,
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
      const dialog =
        event.target instanceof Element ? event.target.closest('[role="dialog"]') : null;
      if (dialog && !dialog.contains(ref.current)) return;

      if (
        event.target instanceof Element &&
        event.target.closest("[data-eda-select-popover]") &&
        ref.current?.querySelector('[role="combobox"][aria-expanded="true"]')
      )
        return;

      if (
        !ref.current?.contains(event.target as Node) &&
        !(triggerRef ?? returnFocusRef)?.current?.contains(event.target as Node)
      )
        dismiss.current();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.contains(event.target as Node)) {
        event.preventDefault();
        event.stopPropagation();
        dismiss.current();
        opener?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [ref, active, returnFocusRef, triggerRef]);
}
