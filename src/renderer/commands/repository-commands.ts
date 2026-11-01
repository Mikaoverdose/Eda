import { errorText } from "@shared/error-codes";
import { err, type Result } from "@shared/errors";
import { t } from "@shared/i18n";
import type { EdaApi } from "@shared/ipc";
import { useAppStore } from "../stores/app-store";
import { useRepositoryStore } from "../stores/repository-store";
import { useSessionStore } from "../stores/session-store";
import type { ShellCommandId } from "./shell-commands";

export const REPOSITORY_COMMANDS = {
  createBranch: { title: t("repositoryCommands.createBranch"), entry: "repository.createBranch" },
  checkoutBranch: { title: t("repositoryCommands.checkOutBranch"), entry: "repository.references" },
  renameBranch: { title: t("repositoryCommands.renameBranch"), entry: "repository.references" },
  deleteBranch: { title: t("repositoryCommands.deleteBranch"), entry: "repository.references" },
  createTag: { title: t("repositoryCommands.createTag"), entry: "repository.createTag" },
  checkoutTag: {
    title: t("repositoryCommands.checkOutTagDetachedHead"),
    entry: "repository.references",
  },
  deleteTag: { title: t("repositoryCommands.deleteTag"), entry: "repository.references" },
} as const satisfies Record<string, { title: string; entry: ShellCommandId }>;

export type RepositoryCommandId = keyof typeof REPOSITORY_COMMANDS;

export type RepositoryCommandContext = {
  repositoryId: string;
  profileId: string | null;
  generation: number;
};

export function captureRepositoryCommand(repositoryId: string): RepositoryCommandContext {
  const session = useSessionStore.getState().snapshot;
  return {
    repositoryId,
    profileId: session?.context.profileId ?? null,
    generation: session?.context.generation ?? 0,
  };
}

export function repositoryCommandReason(context: RepositoryCommandContext): string | null {
  const app = useAppStore.getState();
  const session = useSessionStore.getState();
  const repository = useRepositoryStore.getState();

  if (
    !context.profileId ||
    session.transitioning ||
    app.switchingIdentityId !== null ||
    app.activeIdentity?.id !== context.profileId ||
    app.selectedRepositoryId !== context.repositoryId ||
    session.snapshot?.context.generation !== context.generation
  )
    return t("repositoryCommands.theProfileOrRepositoryChangedReopenThisActionInTheCurrentContext");

  if (
    repository.repositoryId !== context.repositoryId ||
    repository.identityId !== context.profileId ||
    repository.phase !== "ready"
  )
    return t("repositoryCommands.waitForThisRepositoryToFinishLoading");

  if (repository.writing) return t("repositoryCommands.waitForTheRepositoryOperationToFinish");
  if (repository.status?.capabilities?.write === false)
    return (
      repository.status.capabilities.reason ?? t("repositoryCommands.thisRepositoryIsReadOnly")
    );

  return null;
}

export async function executeRepositoryCommand<K extends RepositoryCommandId>(
  command: K,
  request: Parameters<EdaApi["repository"][K]>[0],
  expected = captureRepositoryCommand(request.repositoryId),
): Promise<Result<void>> {
  const reason =
    expected.repositoryId !== request.repositoryId
      ? errorText("repositoryCommands.theActionBelongsToADifferentRepository")
      : repositoryCommandReason(expected);

  if (reason)
    return err({
      kind: "invalid-input",
      operation: REPOSITORY_COMMANDS[command].title,
      message:
        typeof reason === "string" ? errorText("errors.operationBlocked", { reason }) : reason,
    });

  const execute = window.eda.repository[command] as (
    request: Parameters<EdaApi["repository"][K]>[0],
  ) => Promise<Result<void>>;

  return execute(request);
}

export function repositoryCommandDispatcher(context: RepositoryCommandContext) {
  return <K extends RepositoryCommandId>(
    command: K,
    request: Parameters<EdaApi["repository"][K]>[0],
  ) => executeRepositoryCommand(command, request, context);
}
