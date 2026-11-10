import { useContext, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cx } from "../cx";
import { ModalSurfaceContext } from "./ModalSurface";
import { PopoverSurface, type PopoverSurfaceProps } from "./PopoverSurface";

export function ContextPopover({
  position,
  className,
  children,
  ...props
}: Omit<PopoverSurfaceProps, "surfaceRef" | "style"> & {
  position: { x: number; y: number };
}) {
  const modal = useContext(ModalSurfaceContext);
  const surface = useRef<HTMLDivElement>(null);
  const container = modal?.current ?? document.body;
  const { x, y } = position;

  useLayoutEffect(() => {
    const element = surface.current!;

    const update = () => {
      const left = Math.max(8, Math.min(x, window.innerWidth - element.offsetWidth - 8));
      const top = Math.max(8, Math.min(y, window.innerHeight - element.offsetHeight - 8));
      const bounds = container === document.body ? null : container.getBoundingClientRect();

      element.style.left = `${left - (bounds?.left ?? 0) + (bounds ? container.scrollLeft : 0)}px`;
      element.style.top = `${top - (bounds?.top ?? 0) + (bounds ? container.scrollTop : 0)}px`;
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [container, x, y]);

  return createPortal(
    <PopoverSurface
      {...props}
      surfaceRef={surface}
      className={cx("max-w-[calc(100vw-16px)] overflow-y-auto p-1", className)}
      style={{
        position: container === document.body ? "fixed" : "absolute",
        maxHeight: "calc(100vh - 16px)",
        left: x,
        top: y,
      }}
    >
      {children}
    </PopoverSurface>,
    container,
  );
}
