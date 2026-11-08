import { NodeProcessRunner } from "../git/execution/node-process-runner";
import type { ProcessRunner } from "../git/execution/process-runner";

export async function migrateMacosKeychain(
  runner: ProcessRunner = new NodeProcessRunner(),
): Promise<void> {
  if (process.platform !== "darwin") return;

  try {
    const result = await runner.run({
      executable: "/usr/bin/security",
      args: ["delete-generic-password", "-s", "eda Safe Storage", "-a", "eda"],
      cwd: "/",
      env: { PATH: "/usr/bin:/bin" },
      signal: AbortSignal.timeout(30_000),
      maxStdoutBytes: 16 * 1024,
      maxStderrBytes: 16 * 1024,
    });

    if (result.exitCode !== 0 && result.exitCode !== 44)
      console.warn(
        "[Eda Keychain] Could not delete the legacy entry:",
        result.stderr.toString().trim(),
      );
  } catch (error) {
    console.warn(
      "[Eda Keychain] Could not delete the legacy entry:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
