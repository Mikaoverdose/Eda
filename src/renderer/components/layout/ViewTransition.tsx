import {
  Activity,
  createElement,
  useCallback,
  type HTMLAttributes,
  type Ref,
  type ReactNode,
} from "react";
import { LayoutMotion } from "./layout-motion-context";
import { useViewTransition } from "./hooks/useViewTransition";

export function ViewTransition({
  as: Element = "div",
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "div" | "main" | "section";
  ref?: Ref<HTMLElement>;
}) {
  return createElement(Element, props);
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
