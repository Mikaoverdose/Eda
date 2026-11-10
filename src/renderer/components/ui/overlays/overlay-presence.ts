import { useLayoutEffect } from "react";

const surfaces = new Set<symbol>();

export function hasOpenOverlay(): boolean {
  return surfaces.size > 0;
}

export function registerOverlay(): () => void {
  const token = Symbol();
  surfaces.add(token);

  return () => {
    surfaces.delete(token);
  };
}

export function useOverlayPresence(): void {
  useLayoutEffect(registerOverlay, []);
}
