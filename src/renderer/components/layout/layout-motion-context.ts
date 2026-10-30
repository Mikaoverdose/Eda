import { createContext } from "react";

export const LayoutMotion = createContext<(update: () => void) => void>((update) => update());
