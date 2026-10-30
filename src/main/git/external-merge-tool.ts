import { t } from "@shared/i18n";
import { mkdtemp, writeFile, open, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GitError } from "@shared/errors";
import { isMergeTool, type MergeTool } from "@shared/integrations/merge-tool";
import { buildGitEnvironment } from "./execution/environment";
import type { ProcessRunner } from "./execution/process-runner";
import type { OperationManager } from "../operations/operation-manager";

export class ExternalMergeTool {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly operations?: Pick<OperationManager, "signal" | "progress">,
  ) {}

  async run(
    config: MergeTool,
    versions: Record<"base" | "current" | "incoming" | "result", Buffer>,
  ): Promise<string> {
    const fail = (message: string) =>
      new GitError({
        kind: "invalid-input",
        operation: t("operations.externalMergeTool"),
        message,
      });

    if (!isMergeTool(config) || !config.executable)
      throw fail(
        t("main.git.externalMergeTool.configureAnExternalMergeToolInApplicationSettingsFirst"),
      );

    const prefix = join(tmpdir(), "eda-merge-tool-");
    const directory = await mkdtemp(prefix);

    try {
      const paths = {
        base: join(directory, "base.txt"),
        current: join(directory, "current.txt"),
        incoming: join(directory, "incoming.txt"),
        result: join(directory, "result.txt"),
      };

      await Promise.all(
        Object.entries(paths).map(([key, path]) =>
          writeFile(path, versions[key as keyof typeof paths], { mode: 0o600 }),
        ),
      );

      const args = config.args.map((arg) =>
        arg.replace(
          /\{(base|current|incoming|result)\}/g,
          (_, key: keyof typeof paths) => paths[key],
        ),
      );

      const signal = this.operations?.signal;

      this.operations?.progress(
        t(
          "main.git.externalMergeTool.openingExternalMergeToolSaveItsResultAndCloseTheToolToReturnToEda",
        ),
      );

      const result = await this.runner
        .run({
          executable: config.executable,
          args,
          cwd: directory,
          env: buildGitEnvironment(),
          ...(signal ? { signal } : {}),
          maxStdoutBytes: 64 * 1024,
          maxStderrBytes: 64 * 1024,
          onStderrLine: (line) => this.operations?.progress(line),
        })
        .catch(() => {
          throw fail(t("main.git.externalMergeTool.couldNotStartTheExternalMergeToolCheck"));
        });

      if (result.cancelled)
        throw new GitError({
          kind: "cancelled",
          operation: t("operations.externalMergeTool"),
          message: t("main.git.externalMergeTool.externalMergeCancelledRepositoryFilesAndTheIndex"),
        });

      if (result.outputLimitExceeded)
        throw fail(t("main.git.externalMergeTool.theExternalToolExceededItsDiagnosticOutputLimit"));

      if (result.exitCode !== 0)
        throw fail(
          t("main.git.externalMergeTool.theExternalMergeToolExitedWithCodeRepository", {
            exitCode: result.exitCode,
          }),
        );

      const info = await lstat(paths.result);

      if (!info.isFile() || info.isSymbolicLink())
        throw fail(t("main.git.externalMergeTool.theMergeToolMustSaveARegularResultFile"));

      const handle = await open(paths.result, "r");
      let bytes: Buffer;

      try {
        const buffer = Buffer.alloc(4 * 1024 * 1024 + 1);
        const result = await handle.read(buffer, 0, buffer.length, 0);
        if (result.bytesRead > 4 * 1024 * 1024)
          throw fail(t("main.git.externalMergeTool.theMergeResultExceedsThe4MiBEditorLimit"));
        bytes = buffer.subarray(0, result.bytesRead);
      } finally {
        await handle.close();
      }

      if (bytes.includes(0))
        throw fail(t("main.git.externalMergeTool.theMergeToolProducedBinaryContentUseWhole"));

      try {
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        throw fail(t("main.git.externalMergeTool.theMergeToolMustSaveTheResultAsUtf8Text"));
      }
    } finally {
      if (resolve(directory).startsWith(resolve(prefix)))
        await rm(directory, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}
