import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import { isAbsolute } from "node:path";
import { absoluteSearchPath } from "./executable";

export async function restoreShellPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  if (platform === "win32") return;

  try {
    const shell = env["SHELL"] || userInfo().shell;
    if (!shell || !isAbsolute(shell)) return;

    const marker = `EDA_PATH_${randomUUID()}`;
    const output = await new Promise<string>((resolve, reject) => {
      execFile(
        shell,
        ["-ilc", `printf '\\n${marker}\\n'; /usr/bin/printenv PATH; printf '${marker}\\n'`],
        { env, encoding: "utf8", timeout: 5_000, maxBuffer: 1024 * 1024 },
        (error, stdout) => (error ? reject(error) : resolve(stdout)),
      );
    });
    const value = output.split(`${marker}\n`)[1]?.trim();
    if (!value || /[\r\n\0]/.test(value)) return;

    const path = absoluteSearchPath(value, platform);
    if (path) env["PATH"] = path;
  } catch {
    return;
  }
}
