import { ERROR_CODE } from "@shared/error-codes";
import { AppError } from "@shared/errors";
import { t } from "@shared/i18n";
import type { SshAgentMode } from "@shared/identity/ssh";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGitEnvironment } from "../execution/environment";
import { resolveExecutable } from "../execution/executable";

export class SshAgent {
  readonly environment: Record<string, string>;
  unavailableReason: string | undefined;
  private child: ChildProcess | undefined;
  private directory: string | undefined;
  private starting: Promise<void> | undefined;
  private stopping = false;

  constructor(
    readonly source: SshAgentMode,
    private readonly executable = "ssh-agent",
    private readonly baseEnv: Readonly<Record<string, string>> = {},
  ) {
    // Clear inherited agent settings so a failed startup can't use another agent.
    this.environment = source === "builtin" ? { SSH_AUTH_SOCK: "", SSH_AGENT_PID: "" } : {};
  }

  start(): Promise<void> {
    if (this.source === "system") return Promise.resolve();
    return (this.starting ??= this.launch());
  }

  private readonly onProcessExit = () => {
    this.child?.kill();
  };

  private async launch(): Promise<void> {
    try {
      this.directory = await mkdtemp(join(tmpdir(), "eda-ssh-agent-"));
      const socket = join(this.directory, "agent").replaceAll("\\", "/");
      const env = buildGitEnvironment({ overrides: { ...this.baseEnv, ...this.environment } });
      const executable = await resolveExecutable(this.executable, env);
      const child = spawn(executable, ["-D", "-s", "-a", socket, "-t", "3600"], {
        shell: false,
        windowsHide: true,
        env,
        stdio: ["ignore", "pipe", "ignore"],
      });
      this.child = child;
      process.once("exit", this.onProcessExit);

      await new Promise<void>((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => reject(new AppError(ERROR_CODE.SSH_AGENT_TIMEOUT)), 5000);
        const ready = (chunk: Buffer) => {
          output += chunk.toString("utf8");
          const match = /(?:^|\n)SSH_AUTH_SOCK=([^;\r\n]+);/.exec(output);
          if (match?.[1]) {
            this.environment["SSH_AUTH_SOCK"] = match[1];
            this.environment["SSH_AGENT_PID"] = String(child.pid);
            clearTimeout(timer);
            child.stdout?.off("data", ready);
            resolve();
          } else if (output.length > 16_384) {
            clearTimeout(timer);
            reject(new AppError(ERROR_CODE.INVALID_SSH_AGENT_RESPONSE));
          }
        };
        child.stdout?.on("data", ready);
        child.once("error", () => {
          clearTimeout(timer);
          reject(new AppError(ERROR_CODE.SSH_AGENT_START_FAILED));
        });
        child.once("close", () => {
          clearTimeout(timer);
          this.environment["SSH_AUTH_SOCK"] = "";
          this.environment["SSH_AGENT_PID"] = "";
          if (!this.stopping)
            this.unavailableReason = t(
              "main.sshAgent.edaSBuiltInSshAgentStoppedRestartEdaToUnlockKeys",
            );
          process.off("exit", this.onProcessExit);
          reject(new AppError(ERROR_CODE.SSH_AGENT_EXITED));
        });
      });
    } catch {
      this.unavailableReason = t("main.git.sshAgent.edaCouldNotStartItsBuiltInSsh");
      await this.stop();
    }
  }

  async reset(): Promise<void> {
    if (this.source !== "builtin") return;
    await this.stop();
    this.starting = undefined;
    this.stopping = false;
    this.unavailableReason = undefined;
    await this.start();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (child && child.pid && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
        }, 1500);
        child.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill();
      });
    }
    process.off("exit", this.onProcessExit);
    if (this.source === "builtin") {
      this.environment["SSH_AUTH_SOCK"] = "";
      this.environment["SSH_AGENT_PID"] = "";
    }
    if (this.directory) await rm(this.directory, { recursive: true, force: true });
  }
}
