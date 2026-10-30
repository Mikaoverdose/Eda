import { ok } from "@shared/errors";
import type { EdaApi } from "@shared/ipc";
import type { SessionSnapshot } from "@shared/identity/profile-session";
import { useAppStore } from "@renderer/stores/app-store";
import { useRepositoryStore } from "@renderer/stores/repository-store";
import { useSessionStore } from "@renderer/stores/session-store";
import {
  captureRepositoryCommand,
  executeRepositoryCommand,
  repositoryCommandReason,
  REPOSITORY_COMMANDS,
} from "@renderer/commands/repository-commands";
import { SHELL_COMMANDS } from "@renderer/commands/shell-commands";

beforeEach(() => {
  useAppStore.setState({
    activeIdentity: { id: "profile" } as never,
    selectedRepositoryId: "repo",
    switchingIdentityId: null,
  });
  useSessionStore.setState({
    snapshot: { context: { profileId: "profile", generation: 1 } } as SessionSnapshot,
    transitioning: false,
  });
  useRepositoryStore.setState({
    repositoryId: "repo",
    identityId: "profile",
    phase: "ready",
    writing: false,
    status: {
      branch: { detached: false, unborn: false, ahead: 0, behind: 0 },
      changes: [],
      capabilities: { write: true },
    },
  });
});

it("rejects stale context before a reference command crosses IPC", async () => {
  const execute = vi.fn(async () => ok(undefined));

  Object.defineProperty(window, "eda", {
    configurable: true,
    value: { repository: { deleteBranch: execute } } as unknown as EdaApi,
  });

  const context = captureRepositoryCommand("repo");

  useAppStore.setState({ selectedRepositoryId: "other" });

  const result = await executeRepositoryCommand(
    "deleteBranch",
    { repositoryId: "repo", name: "feature" },
    context,
  );

  expect(result.ok).toBe(false);
  expect(execute).not.toHaveBeenCalled();
});

it("explains a read-only repository and dispatches only after it becomes writable", async () => {
  const execute = vi.fn(async () => ok(undefined));

  Object.defineProperty(window, "eda", {
    configurable: true,
    value: { repository: { createTag: execute } } as unknown as EdaApi,
  });

  const context = captureRepositoryCommand("repo");
  const status = useRepositoryStore.getState().status!;

  useRepositoryStore.setState({
    status: { ...status, capabilities: { write: false, reason: "Metadata is read-only" } },
  });
  expect(repositoryCommandReason(context)).toBe("Metadata is read-only");
  expect(
    (await executeRepositoryCommand("createTag", { repositoryId: "repo", name: "v1" }, context)).ok,
  ).toBe(false);

  useRepositoryStore.setState({ status });
  expect(
    (await executeRepositoryCommand("createTag", { repositoryId: "repo", name: "v1" }, context)).ok,
  ).toBe(true);
  expect(execute).toHaveBeenCalledExactlyOnceWith({ repositoryId: "repo", name: "v1" });
});

it("provides a discoverable palette entry for each contextual reference command", () => {
  for (const command of Object.values(REPOSITORY_COMMANDS))
    expect(SHELL_COMMANDS.some((entry) => entry.id === command.entry)).toBe(true);
});
