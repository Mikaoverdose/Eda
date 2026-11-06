import { t } from "@shared/i18n";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Coachmark, Spotlight } from "../components/ui/overlays/Spotlight";
import { POPOVER_SURFACE_STYLE } from "../components/ui/overlays/PopoverSurface";
import { placeGuide } from "./placement";
import { Button, TextButton } from "../components/ui/index";
import type { TourStep } from "./steps";

export function TourGuide({
  steps,
  prepare,
  complete,
  subscribe,
  onFinish,
  onReady,
}: {
  steps: readonly TourStep[];
  prepare: (step: TourStep, previous?: TourStep) => Promise<void>;
  complete: (step: TourStep) => boolean;
  subscribe: (notify: () => void) => () => void;
  onFinish: () => void;
  onReady?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [prepared, setPrepared] = useState<TourStep | null>(null);
  const completedOnEntry = useRef(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [bounds, setBounds] = useState<DOMRect | null>(null);
  const [hintBounds, setHintBounds] = useState<DOMRect | null>(null);
  const [done, setDone] = useState(false);
  const announcedReady = useRef(false);
  const previous = useRef<TourStep>(undefined);
  const card = useRef<HTMLElement>(null);
  const [cardSize, setCardSize] = useState({ width: 340, height: 240 });
  const step = steps[index]!;
  const ready = prepared === step;
  const displayedStep = prepared ?? previous.current ?? step;
  useLayoutEffect(() => {
    if (!card.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setCardSize({
          width: entry.target.getBoundingClientRect().width,
          height: entry.target.getBoundingClientRect().height,
        });
    });
    observer.observe(card.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    setPrepared(null);
    setDone(false);
    setError(false);
    void prepare(step, previous.current)
      .then(() => {
        if (alive) {
          previous.current = step;
          completedOnEntry.current = complete(step);
          setPrepared(step);
        }
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [step, prepare, complete, revision]);

  useLayoutEffect(() => {
    if (!ready) return;
    card.current?.focus();
    let frame = 0;
    let target: HTMLElement | null = null;
    const resize = new ResizeObserver(() => schedule());
    const measure = () => {
      const next = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (next !== target) {
        if (target) resize.unobserve(target);
        target = next;
        if (target) {
          resize.observe(target);
          target.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      }
      const rect = target?.getBoundingClientRect();
      const hintRect = step.hintTarget
        ? document
            .querySelector<HTMLElement>(`[data-tour="${step.hintTarget}"]`)
            ?.getBoundingClientRect()
        : rect;
      setHintBounds(hintRect && hintRect.width > 0 && hintRect.height > 0 ? hintRect : null);
      const completed = complete(step);
      if (rect && rect.width > 0 && rect.height > 0) setBounds(rect);
      else if (!completed) setBounds(null);
      setDone(completed);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.getElementById("demo-workspace")!, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    mutations.observe(document.body, { childList: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("click", schedule);
    const unsubscribe = subscribe(schedule);
    measure();
    return () => {
      resize.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
      unsubscribe();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("click", schedule);
    };
  }, [step, ready, complete, subscribe]);

  useEffect(() => {
    if (!ready || !bounds || announcedReady.current || !onReady) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        announcedReady.current = true;
        onReady();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, bounds, onReady]);

  const autoPending = ready && done && step.advance === "on-complete" && !completedOnEntry.current;
  useEffect(() => {
    if (!autoPending) return;
    if (index === steps.length - 1) onFinish();
    else setIndex(index + 1);
  }, [autoPending, index, step, steps.length, onFinish]);

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const hintCenter = hintBounds ? hintBounds.left + hintBounds.width / 2 : 0;
  const hintLeft = Math.max(120, Math.min(hintCenter, viewport.width - 120));
  const arrowStyle = { marginLeft: (hintCenter - hintLeft) * 2 };
  return (
    <>
      <Spotlight bounds={bounds} viewport={viewport} />
      {ready && step.task && !done && hintBounds && (
        <div
          className="pointer-events-none fixed z-[105] flex flex-col items-center gap-1 text-accent"
          style={{
            left: hintLeft,
            top:
              hintBounds.top >= 64
                ? hintBounds.top - 60
                : Math.min(hintBounds.bottom - 8, viewport.height - 64),
            transform: "translateX(-50%)",
          }}
        >
          <div
            className="ui-tour-click-hint flex w-56 flex-col items-center gap-1 font-ui text-xs leading-normal tracking-tight"
            data-direction={hintBounds.top < 64 ? "up" : "down"}
          >
            {hintBounds.top < 64 && (
              <ArrowUp style={arrowStyle} aria-hidden="true" size={28} strokeWidth={2} />
            )}
            <span
              className={`${POPOVER_SURFACE_STYLE} max-w-[calc(100vw-2rem)] px-3 py-1 text-center font-medium`}
            >
              {t(step.hintLabel ?? "tutorial.tourGuide.clickHighlightedArea")}
            </span>
            {hintBounds.top >= 64 && (
              <ArrowDown style={arrowStyle} aria-hidden="true" size={28} strokeWidth={2} />
            )}
          </div>
        </div>
      )}
      <Coachmark
        ref={card}
        label={t("tutorial.tourGuide.guidedTour")}
        position={placeGuide(bounds, cardSize, viewport, step.hintTarget ? hintBounds : null)}
        contentKey={displayedStep.id}
        eyebrow={`${steps.indexOf(displayedStep) + 1} / ${steps.length} · ${displayedStep.task ? t("tutorial.tourGuide.tryIt") : t("tutorial.tourGuide.goodToKnow")}`}
        title={displayedStep.title}
        description={displayedStep.description}
        footer={
          <>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                disabled={index === 0 || (!ready && !error)}
                onClick={() => setIndex((i) => i - 1)}
              >
                {t("common.back")}
              </Button>
              {(!step.task || (done && !autoPending)) && (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!ready}
                  onClick={() => (index === steps.length - 1 ? onFinish() : setIndex((i) => i + 1))}
                >
                  {index === steps.length - 1
                    ? t("tutorial.tourGuide.finishTour")
                    : t("common.next")}
                </Button>
              )}
            </div>
            <div className="flex justify-between gap-2">
              <TextButton onClick={onFinish}>{t("tutorial.tourGuide.skipTour")}</TextButton>
              {(step.task || !bounds || error) && (
                <TextButton
                  onClick={() => (index === steps.length - 1 ? onFinish() : setIndex((i) => i + 1))}
                >
                  {t("tutorial.tourGuide.skipThisStep")}
                </TextButton>
              )}
            </div>
            {error && (
              <Button onClick={() => setRevision((r) => r + 1)}>{t("common.retry")}</Button>
            )}
          </>
        }
      >
        {error && <p role="alert">{t("tutorial.tourGuide.couldnTLoadThisStepRetryOrSkip")}</p>}
        {ready && !bounds && (
          <p className="mt-1 text-xs text-text-tertiary">
            {t("tutorial.tourGuide.controlHiddenSkipThisStep")}
          </p>
        )}
      </Coachmark>
    </>
  );
}
