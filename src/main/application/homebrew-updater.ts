import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { isRecord } from "@shared/validation";
import { buildGitEnvironment } from "../git/execution/environment";
import type { ProcessRunner } from "../git/execution/process-runner";

const CASK = "yuzuzensai/tap/eda";

export class HomebrewUpdater {
  private readonly environment: Record<string, string>;

  constructor(
    private readonly runner: ProcessRunner,
    private readonly executable: string,
    private readonly directory: string,
    private readonly currentVersion: string,
    readonly restart: () => void,
    environment: NodeJS.ProcessEnv = process.env,
  ) {
    this.environment = buildGitEnvironment(
      {
        overrides: {
          NONINTERACTIVE: "1",
          HOMEBREW_NO_AUTO_UPDATE: "1",
          HOMEBREW_NO_INSTALL_CLEANUP: "1",
          HOMEBREW_NO_ENV_HINTS: "1",
          HOMEBREW_NO_SUDO: "1",
        },
      },
      environment,
    );

    for (const key of ["USER", "LOGNAME", "SHELL"] as const) {
      const value = environment[key];

      if (value !== undefined) this.environment[key] = value;
    }
  }

  async check(version: string): Promise<string | null> {
    await this.run(["update"], 120_000);
    const cask = await this.info();

    if (cask["pinned"] === true) return t("main.homebrew.pinned");

    if (
      cask["version"] !== version ||
      cask["installed"] !== this.currentVersion ||
      cask["outdated"] !== true ||
      cask["disabled"] === true ||
      typeof cask["sha256"] !== "string" ||
      !/^[a-f0-9]{64}$/i.test(cask["sha256"])
    )
      return t("main.homebrew.waitingForCask", { version });

    return null;
  }

  async install(version: string): Promise<void> {
    const reason = await this.check(version);

    if (reason)
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.installUpdate"),
        message: errorText("errors.operationBlocked", { reason }),
      });

    // Keep Eda alive to report failures and only restart after Homebrew confirms the upgrade.
    await this.run(["upgrade", "--cask", "--no-quit", "--require-sha", CASK], 15 * 60_000);

    if ((await this.info())["installed"] !== version) throw this.failure();
  }

  private async info(): Promise<Record<string, unknown>> {
    const output = await this.run(["info", "--json=v2", "--cask", CASK], 30_000);
    let data: unknown;

    try {
      data = JSON.parse(output);
    } catch {
      throw this.failure();
    }

    if (!isRecord(data) || !Array.isArray(data["casks"]) || data["casks"].length !== 1)
      throw this.failure();

    const cask: unknown = data["casks"][0];

    if (!isRecord(cask) || cask["full_token"] !== CASK) throw this.failure();

    return cask;
  }

  private async run(args: readonly string[], timeout: number): Promise<string> {
    try {
      const result = await this.runner.run({
        executable: this.executable,
        args,
        cwd: this.directory,
        env: this.environment,
        signal: AbortSignal.timeout(timeout),
        maxStdoutBytes: 1024 * 1024,
        maxStderrBytes: 256 * 1024,
      });

      if (result.exitCode !== 0 || result.cancelled || result.outputLimitExceeded)
        throw this.failure();

      return result.stdout.toString("utf8");
    } catch {
      throw this.failure();
    }
  }

  private failure(): GitError {
    return new GitError({
      kind: "invalid-input",
      operation: t("operations.updateEda"),
      message: errorText("main.homebrew.failed"),
    });
  }
}
