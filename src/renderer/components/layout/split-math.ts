export interface SplitBounds {
  total: number;
  minFirst: number;
  minSecond: number;
}

export function resolveSplit(fraction: number, bounds: SplitBounds): number {
  const { total, minFirst, minSecond } = bounds;

  if (total <= 0) return 0;

  if (minFirst + minSecond >= total) {
    return Math.round((total * minFirst) / Math.max(1, minFirst + minSecond));
  }

  const safe = Number.isFinite(fraction) ? fraction : 0.5;
  const desired = Math.round(total * Math.min(1, Math.max(0, safe)));

  return Math.min(Math.max(desired, minFirst), total - minSecond);
}

export function fractionFromPosition(position: number, bounds: SplitBounds): number {
  if (bounds.total <= 0) return 0.5;
  return resolveSplit(position / bounds.total, bounds) / bounds.total;
}
