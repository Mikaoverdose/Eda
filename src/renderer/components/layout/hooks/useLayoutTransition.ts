import { useContext } from "react";
import { LayoutMotion } from "../layout-motion-context";

export function useLayoutTransition() {
  return useContext(LayoutMotion);
}
