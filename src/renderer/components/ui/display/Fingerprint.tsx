import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "@shared/i18n";
import { ButtonBase } from "../actions/ButtonBase";
import { CopyButton } from "../actions/AsyncButton";
import { POPOVER_SURFACE_STYLE } from "../overlays/PopoverSurface";
import { cx } from "../cx";

export function Fingerprint({
  value,
  shortValue,
  label = t("fingerprint.label"),
}: {
  value: string;
  shortValue?: string;
  label?: string;
}) {
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const display =
    shortValue ?? (value.length > 24 ? `${value.slice(0, 15)}…${value.slice(-8)}` : value);

  const show = () => {
    clearTimeout(timer.current);
    setAnchor(trigger.current?.getBoundingClientRect() ?? null);
  };

  const leave = () => {
    clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      if (!root.current?.contains(document.activeElement)) setAnchor(null);
    }, 100);
  };

  useEffect(() => {
    setAnchor(null);
    return () => clearTimeout(timer.current);
  }, [value]);

  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);

    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(timer.current);
      close();
    };

    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    document.addEventListener("keydown", escape, true);

    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [anchor]);

  const width = Math.min(420, window.innerWidth - 16);
  const above = anchor && anchor.top > 72;

  return (
    <span
      ref={root}
      className="inline-flex min-w-0 items-center gap-1 text-xs text-text-secondary"
      onMouseEnter={show}
      onMouseLeave={leave}
      onFocus={show}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setAnchor(null);
      }}
    >
      <ButtonBase
        ref={trigger}
        type="button"
        aria-label={t("fingerprint.showFull", { label })}
        aria-describedby={anchor ? id : undefined}
        onClick={show}
        className="min-w-0 rounded-sm text-left font-mono text-xs hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text [overflow-wrap:anywhere]"
      >
        {display}
      </ButtonBase>

      <CopyButton value={value} size="icon-xs" label={t("fingerprint.copy", { label })} />

      {anchor &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className={cx(
              POPOVER_SURFACE_STYLE,
              "fixed z-[100] w-max select-text px-3 py-2 font-mono text-xs [overflow-wrap:anywhere]",
              above && "-translate-y-full",
            )}
            style={{
              maxWidth: width,
              left: Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8)),
              top: above ? anchor.top - 8 : anchor.bottom + 8,
            }}
            onMouseEnter={() => clearTimeout(timer.current)}
            onMouseLeave={leave}
          >
            {value}
          </span>,
          document.body,
        )}
    </span>
  );
}
