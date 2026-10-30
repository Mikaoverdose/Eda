import { POPOVER_SURFACE_STYLE } from "./PopoverSurface";
import { cx } from "../cx";
import type { CSSProperties, ReactNode, Ref } from "react";

export interface SpotlightBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function Spotlight({
  bounds,
  viewport,
  blur = 1.5,
}: {
  bounds: SpotlightBounds | null;
  viewport: { width: number; height: number };
  blur?: number;
}) {
  const hole = bounds
    ? {
        left: Math.max(0, bounds.left - 5),
        top: Math.max(0, bounds.top - 5),
        right: Math.min(viewport.width, bounds.right + 5),
        bottom: Math.min(viewport.height, bounds.bottom + 5),
      }
    : null;
  const masks = hole
    ? [
        { left: 0, top: 0, width: viewport.width, height: hole.top },
        { left: 0, top: hole.bottom, width: viewport.width, height: viewport.height - hole.bottom },
        { left: 0, top: hole.top, width: hole.left, height: hole.bottom - hole.top },
        {
          left: hole.right,
          top: hole.top,
          width: viewport.width - hole.right,
          height: hole.bottom - hole.top,
        },
      ]
    : [{ left: 0, top: 0, width: viewport.width, height: viewport.height }];
  return (
    <>
      {masks.map((style, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="ui-spotlight-motion fixed z-[100] bg-black/20"
          style={{ ...style, backdropFilter: `blur(${blur}px)` }}
        />
      ))}
      {hole && (
        <div
          aria-hidden="true"
          className="ui-spotlight-motion pointer-events-none fixed z-[101] rounded-md border border-accent"
          style={{
            left: hole.left,
            top: hole.top,
            width: hole.right - hole.left,
            height: hole.bottom - hole.top,
          }}
        />
      )}
    </>
  );
}

export function Coachmark({
  ref,
  position,
  label,
  eyebrow,
  contentKey,
  title,
  description,
  children,
  footer,
}: {
  ref?: Ref<HTMLElement>;
  position: CSSProperties;
  label: string;
  eyebrow: string;
  contentKey?: string;
  title: string;
  description: string;
  children?: ReactNode;
  footer: ReactNode;
}) {
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label={label}
      style={position}
      className={cx(
        POPOVER_SURFACE_STYLE,
        "ui-coachmark-motion fixed z-[110] w-[340px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto font-ui text-sm leading-normal tracking-tight outline-none",
      )}
    >
      <div aria-live="polite" className="px-3 py-3">
        <div key={contentKey} className="ui-coachmark-content">
          <p className="mb-2 text-xs text-text-tertiary">{eyebrow}</p>
          <h2 className="text-sm font-medium text-text-primary">{title}</h2>
          <p className="mt-1 text-sm leading-normal text-text-secondary">{description}</p>
          {children}
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-border-subtle px-3 py-2">{footer}</div>
    </section>
  );
}
