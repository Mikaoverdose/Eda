import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ListItemButton } from "../actions/ListItemButton";

export function MenuItem(props: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return <ListItemButton {...props} role="menuitem" variant="menu" />;
}
