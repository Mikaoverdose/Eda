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
  control: TourRect | null = null,
) {
  const margin = 16;
  const gap = 16;
  const clamp = (value: number, max: number) => Math.max(margin, Math.min(value, max - margin));
  if (!target)
    return { left: (viewport.width - card.width) / 2, top: (viewport.height - card.height) / 2 };
  const candidatesFor = (rect: TourRect) =>
    [
      { left: rect.left + rect.width + gap, top: rect.top },
      { left: rect.left - card.width - gap, top: rect.top },
      { left: rect.left, top: rect.top + rect.height + gap },
      { left: rect.left, top: rect.top - card.height - gap },
    ].map((p) => ({
      left: clamp(p.left, viewport.width - card.width),
      top: clamp(p.top, viewport.height - card.height),
    }));
  const candidates = candidatesFor(target);
  if (control) candidates.push(...candidatesFor(control));

  const overlap = (p: { left: number; top: number }, rect: TourRect) =>
    Math.max(
      0,
      Math.min(p.left + card.width, rect.left + rect.width) - Math.max(p.left, rect.left),
    ) *
    Math.max(0, Math.min(p.top + card.height, rect.top + rect.height) - Math.max(p.top, rect.top));
  return candidates.reduce((best, next) => {
    if (control) {
      const difference = overlap(next, control) - overlap(best, control);
      if (difference !== 0) return difference < 0 ? next : best;
    }
    return overlap(next, target) < overlap(best, target) ? next : best;
  });
}
