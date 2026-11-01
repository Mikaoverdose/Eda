import { ERROR_CODE, ERROR_MESSAGE_KEYS, errorText } from "@shared/error-codes";
import { AppError, GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import type { GitEngineInfo, GitEngineSource } from "@shared/integrations/git-engine";
import { buildGitEnvironment } from "./environment";
import { type ProcessRunner, ProcessSpawnError } from "./process-runner";

export type { GitEngineSource } from "@shared/integrations/git-engine";

export interface GitEngine extends GitEngineInfo {
  versionParts: { major: number; minor: number; patch: number };
  environment?: Readonly<Record<string, string>>;
}

export interface ResolveEngineOptions {
  preferred?: GitEngineSource;
  customPath?: string;
  bundledPath?: string;
  bundledEnvironment?: Readonly<Record<string, string>>;
}

const MINIMUM_VERSION = { major: 2, minor: 44, patch: 0 };

export async function resolveGitEngine(
  runner: ProcessRunner,
  options: ResolveEngineOptions = {},
): Promise<GitEngine> {
  const candidates = buildCandidateList(options);
  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      const version = await probeVersion(
        runner,
        candidate.path,
        candidate.source === "bundled" ? options.bundledEnvironment : undefined,
      );

      return {
        source: candidate.source,
        path: candidate.path,
        ...version,
        ...(candidate.source === "bundled" && options.bundledEnvironment
          ? { environment: options.bundledEnvironment }
          : {}),
      };
    } catch (error) {
      failures.push(`${candidate.source} (${candidate.path}): ${describe(error)}`);
    }
  }

  throw new GitError({
    kind: "git-not-found",
    operation: t("operations.locateGit"),
    message: errorText("main.git.gitEngine.edaCouldNotFindAWorkingGitInstallation"),
    suggestedAction: errorText("main.git.gitEngine.theBundledGitInstallationMayBeMissingOr"),
    rawStderr: failures.join("\n"),
  });
}

function buildCandidateList(
  options: ResolveEngineOptions,
): { source: GitEngineSource; path: string }[] {
  const candidates: { source: GitEngineSource; path: string }[] = [];

  const custom = options.customPath
    ? { source: "custom" as const, path: options.customPath }
    : undefined;
  const bundled = options.bundledPath
    ? { source: "bundled" as const, path: options.bundledPath }
    : undefined;
  const system = { source: "system" as const, path: "git" };

  switch (options.preferred ?? "bundled") {
    case "custom":
      if (custom) candidates.push(custom);
      break;
    case "bundled":
      if (bundled) candidates.push(bundled);
      break;
    case "system":
      candidates.push(system);
      break;
    default:
      break;
  }

  for (const candidate of [bundled, system, custom]) {
    if (candidate && !candidates.some((c) => c.path === candidate.path)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

async function probeVersion(
  runner: ProcessRunner,
  path: string,
  environment: Readonly<Record<string, string>> = {},
): Promise<{ version: string; versionParts: GitEngine["versionParts"] }> {
  const result = await runner.run({
    executable: path,
    args: ["--version"],
    env: {
      ...environment,
      ...buildGitEnvironment({ configScope: "none" }),
      ...(environment["PATH"] ? { PATH: environment["PATH"] } : {}),
    },
  });

  if (result.exitCode !== 0) {
    throw new AppError(
      errorText(ERROR_MESSAGE_KEYS[ERROR_CODE.GIT_PROCESS_FAILED], { exitCode: result.exitCode }),
    );
  }

  const stdout = result.stdout.toString("utf8").trim();
  const match = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(stdout);

  if (!match) {
    throw new AppError(
      errorText(ERROR_MESSAGE_KEYS[ERROR_CODE.INVALID_GIT_OUTPUT], { stdout: stdout.slice(0, 80) }),
    );
  }

  const versionParts = {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
  };

  if (isOlderThanMinimum(versionParts)) {
    throw new AppError(
      errorText(ERROR_MESSAGE_KEYS[ERROR_CODE.GIT_VERSION_UNSUPPORTED], {
        major: versionParts.major,
        minor: versionParts.minor,
        minimumVersion: `${MINIMUM_VERSION.major}.${MINIMUM_VERSION.minor}`,
      }),
    );
  }

  return {
    version: `${versionParts.major}.${versionParts.minor}.${versionParts.patch}`,
    versionParts,
  };
}

function isOlderThanMinimum(v: GitEngine["versionParts"]): boolean {
  if (v.major !== MINIMUM_VERSION.major) return v.major < MINIMUM_VERSION.major;
  if (v.minor !== MINIMUM_VERSION.minor) return v.minor < MINIMUM_VERSION.minor;
  return v.patch < MINIMUM_VERSION.patch;
}

function describe(error: unknown): string {
  if (error instanceof ProcessSpawnError) return error.cause.code ?? error.cause.message;
  return error instanceof Error ? error.message : String(error);
}
