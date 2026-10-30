import type { DetectedEditor } from "@shared/integrations/editor";
import { detectApplications } from "./detect-applications";

export const EDITOR_CANDIDATES = [
  {
    name: "Visual Studio Code",
    command: "code",
    mac: "Visual Studio Code.app/Contents/Resources/app/bin/code",
    windows: "Microsoft VS Code/Code.exe",
  },
  {
    name: "Visual Studio Code Insiders",
    command: "code-insiders",
    mac: "Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders",
    windows: "Microsoft VS Code Insiders/Code - Insiders.exe",
  },
  {
    name: "VSCodium",
    command: "codium",
    mac: "VSCodium.app/Contents/Resources/app/bin/codium",
    windows: "VSCodium/VSCodium.exe",
  },
  {
    name: "Cursor",
    command: "cursor",
    mac: "Cursor.app/Contents/Resources/app/bin/cursor",
    windows: "cursor/Cursor.exe",
  },
  {
    name: "Windsurf",
    command: "windsurf",
    mac: "Windsurf.app/Contents/Resources/app/bin/windsurf",
    windows: "Windsurf/Windsurf.exe",
  },
  { name: "Zed", command: "zed", mac: "Zed.app/Contents/MacOS/cli", windows: "Zed/zed.exe" },
  {
    name: "Sublime Text",
    command: "subl",
    mac: "Sublime Text.app/Contents/SharedSupport/bin/subl",
    windows: "Sublime Text/subl.exe",
  },
  { name: "Notepad++", command: "notepad++", windows: "Notepad++/notepad++.exe" },
  { name: "Kate", command: "kate" },
  { name: "GNOME Text Editor", command: "gnome-text-editor" },
  { name: "Gedit", command: "gedit" },
] as const;

export function detectEditors(): Promise<DetectedEditor[]> {
  return detectApplications(EDITOR_CANDIDATES);
}
