export const ACTION_FEEDBACK = {
  spinnerDelay: 200,
  minimumPending: 350,
  outcomeHold: 1400,
} as const;

export function prefersReducedMotion(): boolean {
  return (
    document.documentElement.dataset["reducedMotion"] === "true" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function motionDuration(token: "fade" | "collapse"): number {
  if (prefersReducedMotion()) return 0;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--duration-${token}`)
    .trim();
  const duration = Number.parseFloat(value);
  return Number.isFinite(duration) ? duration * (value.endsWith("ms") ? 1 : 1000) : 0;
}
