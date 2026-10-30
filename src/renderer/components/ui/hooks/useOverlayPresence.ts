import { useLayoutEffect } from "react";
import { registerOverlay } from "../overlays/overlay-presence";

export function useOverlayPresence(): void {
  useLayoutEffect(registerOverlay, []);
}
