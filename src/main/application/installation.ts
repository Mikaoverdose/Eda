import type { InstallationInfo } from "@shared/application";
import { readdir, realpath } from "node:fs/promises";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { buildGitEnvironment } from "../git/execution/environment";
import { NodeProcessRunner } from "../git/execution/node-process-runner";
import { ProcessSpawnError, type ProcessRunner } from "../git/execution/process-runner";

interface InstallationOptions {
  packaged: boolean;
  executablePath: string;
  resourcesPath: string;
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
}

type NonHomebrewInstallation = Exclude<InstallationInfo, { method: "homebrew" }>;
type DetectedInstallation = NonHomebrewInstallation | { method: "homebrew"; executable: string };

function missingPath(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

async function homebrewInstallation(
  resourcesPath: string,
  environment: NodeJS.ProcessEnv,
): Promise<string | null> {
  const bundle = await realpath(resolve(resourcesPath, "../.."));
  const roots = new Set(
    [
      environment["HOMEBREW_CASKROOM"],
      environment["HOMEBREW_PREFIX"] && join(environment["HOMEBREW_PREFIX"], "Caskroom"),
      "/opt/homebrew/Caskroom",
      "/usr/local/Caskroom",
      ...(environment["PATH"] ?? "")
        .split(delimiter)
        .filter(isAbsolute)
        .map((directory) => resolve(directory, "../Caskroom")),
    ].filter((path): path is string => !!path && isAbsolute(path)),
  );

  for (const root of roots) {
    const cask = join(root, "eda");

    try {
      const versions = await readdir(cask, { withFileTypes: true });

      for (const version of versions.filter(
        (entry) => entry.isDirectory() && !entry.name.startsWith("."),
      )) {
        try {
          if ((await realpath(join(cask, version.name, "Eda.app"))) === bundle)
            return resolve(root, "../bin/brew");
        } catch (error) {
          if (!missingPath(error)) throw error;
        }
      }
    } catch (error) {
      if (!missingPath(error)) throw error;
    }
  }

  return null;
}

async function systemPackageInstallation(
  executablePath: string,
  environment: NodeJS.ProcessEnv,
  runner: ProcessRunner,
): Promise<NonHomebrewInstallation> {
  const path = await realpath(executablePath);
  const candidates = [
    { manager: "dpkg", executable: "dpkg-query", args: ["--search", "--", path] },
    { manager: "rpm", executable: "rpm", args: ["-qf", "--queryformat", "%{NAME}\n", "--", path] },
    { manager: "pacman", executable: "pacman", args: ["-Qoq", "--", path] },
  ] as const;
  const results = await Promise.all(
    candidates.map(async (candidate): Promise<NonHomebrewInstallation | null> => {
      try {
        const result = await runner.run({
          executable: candidate.executable,
          args: candidate.args,
          env: buildGitEnvironment({}, environment),
          signal: AbortSignal.timeout(1500),
          maxStdoutBytes: 8192,
          maxStderrBytes: 8192,
        });

        if (result.cancelled || result.outputLimitExceeded) return { method: "unknown" };
        if (result.exitCode !== 0) return result.exitCode === 1 ? null : { method: "unknown" };

        const output = result.stdout.toString("utf8").trim();
        const owned =
          candidate.manager === "dpkg"
            ? output
                .split("\n")
                .some(
                  (line) =>
                    /^[a-z0-9][a-z0-9+.-]*(?::[a-z0-9-]+)?: /.test(line) &&
                    line.endsWith(`: ${path}`),
                )
            : /^[a-zA-Z0-9@._+-]+$/.test(output);

        return owned
          ? { method: "system-package", manager: candidate.manager }
          : { method: "unknown" };
      } catch (error) {
        if (error instanceof ProcessSpawnError && error.cause.code === "ENOENT") return null;
        return { method: "unknown" };
      }
    }),
  );

  return (
    results.find((result) => result?.method === "system-package") ??
    results.find((result) => result?.method === "unknown") ?? { method: "direct" }
  );
}

export async function detectInstallation(
  options: InstallationOptions,
  runner: ProcessRunner = new NodeProcessRunner(),
): Promise<DetectedInstallation> {
  if (!options.packaged) return { method: "development" };

  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;

  try {
    if (platform === "darwin") {
      const executable = await homebrewInstallation(options.resourcesPath, environment);

      if (executable) return { method: "homebrew", executable };
    }

    if (platform === "linux")
      return await systemPackageInstallation(options.executablePath, environment, runner);

    return { method: "direct" };
  } catch {
    return { method: "unknown" };
  }
}
