import { readRegularFile } from "../filesystem/read-regular-file";
import { errorText, type ErrorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { isMergeTool, type MergeTool } from "@shared/integrations/merge-tool";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { OperationManager } from "../operations/operation-manager";
import { buildGitEnvironment } from "./execution/environment";
import type { ProcessRunner } from "./execution/process-runner";

export class ExternalMergeTool {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly operations?: Pick<OperationManager, "signal" | "progress">,
  ) {}

  async run(
    config: MergeTool,
    versions: Record<"base" | "current" | "incoming" | "result", Buffer>,
  ): Promise<string> {
    const fail = (message: ErrorText) =>
      new GitError({
        kind: "invalid-input",
        operation: t("operations.externalMergeTool"),
        message,
      });

    if (!isMergeTool(config) || !config.executable)
      throw fail(
        errorText(
          "main.git.externalMergeTool.configureAnExternalMergeToolInApplicationSettingsFirst",
        ),
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
          throw fail(
            errorText("main.git.externalMergeTool.couldNotStartTheExternalMergeToolCheck"),
          );
        });

      if (result.cancelled)
        throw new GitError({
          kind: "cancelled",
          operation: t("operations.externalMergeTool"),
          message: errorText(
            "main.git.externalMergeTool.externalMergeCancelledRepositoryFilesAndTheIndex",
          ),
        });

      if (result.outputLimitExceeded)
        throw fail(
          errorText("main.git.externalMergeTool.theExternalToolExceededItsDiagnosticOutputLimit"),
        );

      if (result.exitCode !== 0)
        throw fail(
          errorText("main.git.externalMergeTool.theExternalMergeToolExitedWithCodeRepository", {
            exitCode: result.exitCode,
          }),
        );

      const { bytes } = await readRegularFile(paths.result, 4 * 1024 * 1024, (reason) =>
        fail(
          errorText(
            reason === "size"
              ? "main.git.externalMergeTool.theMergeResultExceedsThe4MiBEditorLimit"
              : "main.git.externalMergeTool.theMergeToolMustSaveARegularResultFile",
          ),
        ),
      );

      if (bytes.includes(0))
        throw fail(
          errorText("main.git.externalMergeTool.theMergeToolProducedBinaryContentUseWhole"),
        );

      try {
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        throw fail(errorText("main.git.externalMergeTool.theMergeToolMustSaveTheResultAsUtf8Text"));
      }
    } finally {
      if (resolve(directory).startsWith(resolve(prefix)))
        await rm(directory, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}
