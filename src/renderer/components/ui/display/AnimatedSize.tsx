import { useLayoutEffect, useRef, type HTMLAttributes } from "react";
import { cx } from "../cx";
import { prefersReducedMotion } from "../../../motion";

export function AnimatedSize({
  children,
  className,
  contentClassName,
  ...props
}: HTMLAttributes<HTMLDivElement> & { contentClassName?: string }) {
  const surface = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outer = surface.current!;
    const inner = content.current!;
    let previous = -1;

    const measure = (entries?: ResizeObserverEntry[]) => {
      const height = entries?.[0]?.borderBoxSize?.[0]?.blockSize ?? inner.offsetHeight;
      if (height === previous) return;

      const disclosure = outer.closest("details");

      const animations = [
        ...(inner.getAnimations?.({ subtree: true }) ?? []),
        ...(disclosure?.getAnimations?.() ?? []),
      ];

      const childResizing = animations.some(
        (animation) =>
          animation.playState === "running" &&
          animation.effect instanceof KeyframeEffect &&
          animation.effect.getKeyframes().some((frame) => "blockSize" in frame),
      );

      const reduced = prefersReducedMotion();
      outer.dataset["sizeMotion"] = previous < 0 || childResizing || reduced ? "follow" : "animate";
      outer.style.blockSize = reduced ? "auto" : `${height}px`;
      previous = height;
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(inner);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      {...props}
      ref={surface}
      className={cx("ui-animated-size min-w-0", className)}
      onTransitionStart={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "block-size")
          event.currentTarget.dataset["resizing"] = "true";
        props.onTransitionStart?.(event);
      }}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "block-size")
          delete event.currentTarget.dataset["resizing"];
        props.onTransitionEnd?.(event);
      }}
      onTransitionCancel={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "block-size")
          delete event.currentTarget.dataset["resizing"];
        props.onTransitionCancel?.(event);
      }}
    >
      <div ref={content} className={cx("flow-root", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
