import { useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { prefersReducedMotion } from "../../../motion";

export type ViewMotion = "forward" | "back" | "section" | "layout";

const traceNavigation = import.meta.env.DEV && import.meta.env["VITE_EDA_TRACE_NAVIGATION"] === "1";

type RunningTransition = { transition: globalThis.ViewTransition; cleanup: () => void };

let running: RunningTransition | undefined;

export function afterViewTransition(effect: () => void): void {
  const job = running;

  if (!job) {
    effect();
    return;
  }

  void job.transition.finished
    .catch(() => {})
    .then(() => {
      if (running && running !== job) afterViewTransition(effect);
      else effect();
    });
}

export function useViewTransition() {
  const target = useRef<HTMLElement | null>(null);
  const fallbackCleanup = useRef<(() => void) | undefined>(undefined);
  const ref = useCallback((element: HTMLElement | null) => {
    fallbackCleanup.current?.();
    target.current = element;
  }, []);
  const transition = useCallback((update: () => void, motion: ViewMotion = "section") => {
    running?.transition.skipTransition();
    running?.cleanup();
    running = undefined;
    fallbackCleanup.current?.();

    const element = target.current;

    if (!element || !document.startViewTransition || prefersReducedMotion()) {
      if (traceNavigation)
        console.info(
          "[Eda navigation] " +
            JSON.stringify({
              motion,
              skipped: !element
                ? "missing-region"
                : !document.startViewTransition
                  ? "unsupported"
                  : "reduced-motion",
            }),
        );

      update();

      return;
    }

    const started = performance.now();
    let updateMs = 0;
    let readyAt: number | undefined;
    let captureError: string | undefined;
    let frameRequest = 0;
    let frames = 0;
    let longestFrameMs = 0;
    let lastFrameAt: number | undefined;
    let oldKeyframe: string | undefined;
    let newKeyframe: string | undefined;
    const transforms = new Set<string>();
    const regions =
      motion === "layout"
        ? Array.from(element.querySelectorAll<HTMLElement>("[data-layout-region]"))
        : [element];
    const previousStyles = regions.map((region, index) => {
      const name = region.style.viewTransitionName;
      const classes = region.style.getPropertyValue("view-transition-class");

      region.style.viewTransitionName =
        motion === "layout" ? `layout-pane-${index}` : "navigation-content";
      if (motion === "layout") region.style.setProperty("view-transition-class", "layout-pane");

      return { region, name, classes };
    });
    const oldSnapshot =
      motion === "layout"
        ? "::view-transition-old(layout-pane-0)"
        : "::view-transition-old(navigation-content)";
    const newSnapshot =
      motion === "layout"
        ? "::view-transition-new(layout-pane-0)"
        : "::view-transition-new(navigation-content)";

    document.documentElement.dataset["navigationMotion"] = motion;

    const cleanup = () => {
      for (const { region, name, classes } of previousStyles) {
        region.style.viewTransitionName = name;
        if (classes) region.style.setProperty("view-transition-class", classes);
        else region.style.removeProperty("view-transition-class");
      }
      delete document.documentElement.dataset["navigationMotion"];
    };
    const native = document.startViewTransition(() => {
      const beforeUpdate = performance.now();
      flushSync(update);
      updateMs = performance.now() - beforeUpdate;
    });
    const job = { transition: native, cleanup };

    running = job;
    void native.ready
      .then(() => {
        readyAt = performance.now();

        if (traceNavigation) {
          oldKeyframe = getComputedStyle(document.documentElement, oldSnapshot).animationName;
          newKeyframe = getComputedStyle(document.documentElement, newSnapshot).animationName;

          const sample = (now: number) => {
            if (running !== job) return;

            frames++;

            if (lastFrameAt !== undefined)
              longestFrameMs = Math.max(longestFrameMs, now - lastFrameAt);

            lastFrameAt = now;

            const style = getComputedStyle(document.documentElement, newSnapshot);

            transforms.add(style.transform + ":" + style.opacity);
            frameRequest = requestAnimationFrame(sample);
          };

          frameRequest = requestAnimationFrame(sample);
        }
      })
      .catch((error: unknown) => {
        captureError = error instanceof Error ? error.message : String(error);

        if (running !== job || prefersReducedMotion() || motion === "layout") return;

        const destination = target.current;

        if (!destination) return;

        destination.dataset["navigationFallback"] = motion;

        const clear = () => {
          delete destination.dataset["navigationFallback"];
          destination.removeEventListener("animationend", end);
          destination.removeEventListener("animationcancel", end);
          fallbackCleanup.current = undefined;
        };

        const end = (event: AnimationEvent) => {
          if (event.target === destination) clear();
        };

        fallbackCleanup.current = clear;
        destination.addEventListener("animationend", end);
        destination.addEventListener("animationcancel", end);
      });
    void native.finished
      .catch(() => {})
      .finally(() => {
        cancelAnimationFrame(frameRequest);

        if (traceNavigation) {
          console.info(
            "[Eda navigation] " +
              JSON.stringify({
                motion,
                updateMs: Math.round(updateMs),
                captureMs: readyAt === undefined ? null : Math.round(readyAt - started),
                animationMs: readyAt === undefined ? null : Math.round(performance.now() - readyAt),
                oldKeyframe,
                newKeyframe,
                frames,
                changingFrames: transforms.size,
                longestFrameMs: Math.round(longestFrameMs),
                superseded: running !== job,
                captureError: captureError ?? null,
                reducedMotion: prefersReducedMotion(),
              }),
          );
        }

        if (running !== job) return;

        cleanup();
        running = undefined;
      });
  }, []);

  return { ref, transition };
}
