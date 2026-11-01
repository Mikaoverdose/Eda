import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { posix, win32 } from "node:path";
import { AppError } from "@shared/errors";
import { errorText } from "@shared/error-codes";

function fullyQualified(path: string, platform: NodeJS.Platform): boolean {
  return platform === "win32"
    ? /^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(path)
    : posix.isAbsolute(path);
}

export function absoluteSearchPath(value: string, platform = process.platform): string {
  const paths = platform === "win32" ? win32 : posix;
  return value
    .split(paths.delimiter)
    .map((entry) => (platform === "win32" ? entry.replace(/^"(.*)"$/, "$1") : entry))
    .filter((entry) => fullyQualified(entry, platform))
    .join(paths.delimiter);
}

export function executableCandidates(
  executable: string,
  env: Readonly<Record<string, string>>,
  platform = process.platform,
): string[] {
  const paths = platform === "win32" ? win32 : posix;
  if (fullyQualified(executable, platform)) return [executable];
  if (/[\\/]/.test(executable)) return [];
  const fallback =
    platform === "win32"
      ? paths.join(env["SystemRoot"] ?? "C:\\Windows", "System32")
      : "/usr/bin:/bin";
  const search = absoluteSearchPath(env["PATH"] ?? fallback, platform);
  const names =
    platform === "win32" && !paths.extname(executable)
      ? [`${executable}.exe`, `${executable}.com`]
      : [executable];
  return search
    .split(paths.delimiter)
    .filter(Boolean)
    .flatMap((directory) => names.map((name) => paths.join(directory, name)));
}

export async function resolveExecutable(
  executable: string,
  env: Readonly<Record<string, string>>,
): Promise<string> {
  for (const path of executableCandidates(executable, env)) {
    try {
      await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
      if ((await stat(path)).isFile()) return path;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        !["ENOENT", "ENOTDIR", "EACCES"].includes(String(error.code))
      )
        throw error;
    }
  }
  throw new AppError(errorText("main.git.executable.notFound", { executable }), "ENOENT");
}
