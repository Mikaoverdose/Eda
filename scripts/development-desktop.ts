import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { DEVELOPMENT_DESKTOP } from "../src/shared/application.ts";

function entryValue(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");
}

export async function prepareDevelopmentDesktop(
  project: string,
  dataHome = process.env["XDG_DATA_HOME"],
): Promise<string> {
  const directory = join(
    dataHome && isAbsolute(dataHome) ? dataHome : join(homedir(), ".local/share"),
    "applications",
  );
  const path = join(directory, DEVELOPMENT_DESKTOP.file);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path,
    [
      "[Desktop Entry]",
      "Type=Application",
      `Name=${DEVELOPMENT_DESKTOP.name}`,
      `Icon=${entryValue(join(project, "build/icon.png"))}`,
      "Exec=pnpm dev",
      `Path=${entryValue(project)}`,
      `StartupWMClass=${DEVELOPMENT_DESKTOP.id}`,
      "NoDisplay=true",
      "Terminal=false",
      "",
    ].join("\n"),
  );
  return path;
}
