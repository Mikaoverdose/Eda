import { animateViewEntry } from "@renderer/components/layout/hooks/useViewTransition";

it("cleans up entry motion on completion, interruption, and reduced motion", async () => {
  const element = document.createElement("div");
  let finish!: () => void;
  const play = vi.fn();

  const animation = {
    animationName: "ui-navigation-in",
    currentTime: 100,
    play,
    finished: new Promise<void>((resolve) => {
      finish = resolve;
    }),
  };

  element.getAnimations = () => [animation as unknown as Animation];
  const clear = animateViewEntry(element, "forward");
  expect(element.dataset["navigationFallback"]).toBe("forward");
  expect(animation.currentTime).toBe(0);
  expect(play).toHaveBeenCalledOnce();
  clear?.();
  animateViewEntry(element, "back");
  await finish();
  expect(element.dataset["navigationFallback"]).toBeUndefined();

  document.documentElement.dataset["reducedMotion"] = "true";

  try {
    animateViewEntry(element, "section");
    expect(element.dataset["navigationFallback"]).toBeUndefined();
    expect(play).toHaveBeenCalledTimes(2);
  } finally {
    delete document.documentElement.dataset["reducedMotion"];
  }
});
