import { useEffect, useRef, type RefObject } from "react";

export function useMenuKeyboard(
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
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    const items = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []).filter(
        (item) => !item.matches(":disabled, [aria-disabled='true']"),
      );

    items()[0]?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (
        !ref.current?.contains(event.target as Node) &&
        !(triggerRef ?? returnFocusRef)?.current?.contains(event.target as Node)
      )
        dismiss.current();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!ref.current?.contains(event.target as Node)) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss.current();
        opener?.focus();
        return;
      }

      if (event.key === "Tab") {
        dismiss.current();
        return;
      }

      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

      const options = items();

      if (!options.length) return;

      event.preventDefault();

      const current = options.indexOf(document.activeElement as HTMLElement);

      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : current < 0
              ? event.key === "ArrowDown"
                ? 0
                : options.length - 1
              : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;

      options[next]?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, { capture: true });

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [active, ref, returnFocusRef, triggerRef]);
}
