import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { readRegularFile } from "../filesystem/read-regular-file";

export async function readCommitTemplate(
  repositoryPath: string,
  configured: string | undefined,
): Promise<string | null> {
  if (!configured) return null;

  let path = configured;

  if (configured.startsWith("~/")) path = join(homedir(), configured.slice(2));
  else if (!isAbsolute(configured)) path = resolve(repositoryPath, configured);

  const { bytes } = await readRegularFile(
    await realpath(path),
    100_000,
    () =>
      new GitError({
        kind: "invalid-input",
        operation: t("operations.validateRequest"),
        message: errorText("main.repositoryHandlers.theCommitTemplateMustBeATextFileUnder100Kb"),
      }),
  );

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new GitError({
      kind: "invalid-input",
      operation: t("operations.validateRequest"),
      message: errorText("main.repositoryHandlers.theCommitTemplateMustUseUtf8Text"),
    });
  }
}
