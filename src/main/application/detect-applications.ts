import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import type { DetectedEditor } from "@shared/integrations/editor";

interface ApplicationCandidate {
  name: string;
  command: string;
  mac?: string;
  windows?: string;
}

export async function detectApplications(
  candidates: readonly ApplicationCandidate[],
): Promise<DetectedEditor[]> {
  const home = homedir();
  const searchPath = (process.env["PATH"] ?? "").split(delimiter).filter(isAbsolute);
  const windowsRoots = [
    process.env["LOCALAPPDATA"] && join(process.env["LOCALAPPDATA"], "Programs"),
    process.env["ProgramFiles"],
    process.env["ProgramFiles(x86)"],
  ].filter((root): root is string => !!root && isAbsolute(root));
  const detected = await Promise.all(
    candidates.map(async (editor): Promise<DetectedEditor | null> => {
      const candidates = searchPath.map((directory) =>
        join(directory, editor.command + (process.platform === "win32" ? ".exe" : "")),
      );

      if (process.platform === "darwin" && editor.mac)
        candidates.push(join("/Applications", editor.mac), join(home, "Applications", editor.mac));
      if (process.platform === "win32" && editor.windows)
        candidates.push(...windowsRoots.map((root) => join(root, editor.windows!)));

      if (process.platform === "linux")
        candidates.push(
          ...["/usr/bin", "/usr/local/bin", "/snap/bin", join(home, ".local/bin")].map((root) =>
            join(root, editor.command),
          ),
        );

      for (const executable of new Set(candidates)) {
        try {
          await access(executable, process.platform === "win32" ? constants.F_OK : constants.X_OK);
          if ((await stat(executable)).isFile()) return { name: editor.name, executable };
        } catch {}
      }

      return null;
    }),
  );

  return detected.filter((editor): editor is DetectedEditor => editor !== null);
}
