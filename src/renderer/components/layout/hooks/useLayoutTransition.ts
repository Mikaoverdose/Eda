import { createContext, useContext } from "react";

export const LayoutMotion = createContext<(update: () => void) => void>((update) => update());

export function useLayoutTransition() {
  return useContext(LayoutMotion);
}
