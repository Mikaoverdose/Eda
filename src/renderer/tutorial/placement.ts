export interface TourRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function placeGuide(
  target: TourRect | null,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const margin = 16;
  const gap = 16;
  const clamp = (value: number, max: number) => Math.max(margin, Math.min(value, max - margin));
  if (!target)
    return { left: (viewport.width - card.width) / 2, top: (viewport.height - card.height) / 2 };
  const right = target.left + target.width;
  const bottom = target.top + target.height;
  const candidates = [
    { left: right + gap, top: target.top },
    { left: target.left - card.width - gap, top: target.top },
    { left: target.left, top: bottom + gap },
    { left: target.left, top: target.top - card.height - gap },
  ].map((p) => ({
    left: clamp(p.left, viewport.width - card.width),
    top: clamp(p.top, viewport.height - card.height),
  }));
  const overlap = (p: (typeof candidates)[number]) =>
    Math.max(0, Math.min(p.left + card.width, right) - Math.max(p.left, target.left)) *
    Math.max(0, Math.min(p.top + card.height, bottom) - Math.max(p.top, target.top));
  return candidates.reduce((best, next) => (overlap(next) < overlap(best) ? next : best));
}
