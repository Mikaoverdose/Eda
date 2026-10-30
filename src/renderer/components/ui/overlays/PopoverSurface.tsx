import { useRef, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { useMenuKeyboard } from "../hooks/useMenuKeyboard";
import { cx } from "../cx";
import { useOverlayPresence } from "../hooks/useOverlayPresence";

export const POPOVER_SURFACE_STYLE =
  "rounded-lg border border-border-default bg-bg-overlay text-text-primary shadow-popover";

export interface PopoverSurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, "role"> {
  role: "menu" | "dialog";
  onClose: () => void;
  interactionRef?: RefObject<HTMLElement | null>;
  surfaceRef?: RefObject<HTMLDivElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function PopoverSurface({
  role,
  onClose,
  interactionRef,
  surfaceRef,
  returnFocusRef,
  className,
  children,
  ...props
}: PopoverSurfaceProps) {
  const fallbackRoot = useRef<HTMLDivElement>(null);
  const root = surfaceRef ?? fallbackRoot;
  const scope = interactionRef ?? root;

  useOverlayPresence();
  useMenuKeyboard(scope, role === "menu", onClose);
  useDismiss(scope, role === "dialog", onClose, returnFocusRef);

  return (
    <div
      {...props}
      ref={root}
      role={role}
      className={cx("ui-popover-in z-50 overflow-hidden", POPOVER_SURFACE_STYLE, className)}
    >
      {children}
    </div>
  );
}
