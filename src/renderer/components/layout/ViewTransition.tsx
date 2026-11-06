import {
  Activity,
  createElement,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type Ref,
  type ReactNode,
} from "react";
import { LayoutMotion } from "./layout-motion-context";
import {
  hasActiveViewTransition,
  useViewTransition,
  type ViewMotion,
} from "./hooks/useViewTransition";
import { prefersReducedMotion } from "../../motion";

export function ViewTransition({
  as: Element = "div",
  ref,
  viewKey,
  motion = "section",
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "div" | "main" | "section";
  ref?: Ref<HTMLElement>;
  viewKey?: string;
  motion?: Exclude<ViewMotion, "layout">;
}) {
  const element = useRef<HTMLElement | null>(null);
  const previous = useRef(viewKey);

  useImperativeHandle(ref, () => element.current!, [Element]);

  useLayoutEffect(() => {
    if (previous.current === viewKey) return;
    previous.current = viewKey;

    const target = element.current;

    if (!target || hasActiveViewTransition() || prefersReducedMotion()) return;
    if (target.parentElement?.closest("[data-navigation-fallback]")) return;

    target.dataset["navigationFallback"] = motion;

    const animation = target
      .getAnimations?.()
      .find((item) => "animationName" in item && item.animationName === "ui-navigation-in");
    let active = true;
    const clear = () => {
      if (!active) return;
      active = false;
      delete target.dataset["navigationFallback"];
    };

    if (animation) {
      animation.currentTime = 0;
      animation.play();
      void animation.finished.then(clear, clear);
    } else clear();

    return clear;
  }, [viewKey, motion]);

  return createElement(Element, { ...props, ref: element });
}

export function LayoutTransition({ children, ...props }: HTMLAttributes<HTMLElement>) {
  const { ref, transition } = useViewTransition();
  const update = useCallback((work: () => void) => transition(work, "layout"), [transition]);

  return (
    <LayoutMotion value={update}>
      <ViewTransition {...props} ref={ref}>
        {children}
      </ViewTransition>
    </LayoutMotion>
  );
}

export function RetainedView({ active, children }: { active: boolean; children: ReactNode }) {
  return <Activity mode={active ? "visible" : "hidden"}>{children}</Activity>;
}
