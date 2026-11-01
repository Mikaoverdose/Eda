import { errorText } from "@shared/error-codes";
import { ok } from "@shared/errors";
import { t } from "@shared/i18n";
import { IPC_CHANNELS, IPC_EVENTS } from "@shared/ipc";
import type { PartialStageRequest } from "@shared/repository/partial-stage";
import { referenceLink } from "@shared/repository/reference-link";
import type { InitRepositoryOptions } from "@shared/repository/repository";
import { MAX_HISTORY_PAGE_SIZE } from "@shared/repository/repository-read";
import { BrowserWindow, dialog, shell } from "electron";
import { readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { repositoryCapabilities } from "../../repo/lifecycle/repository-capabilities";
import { RepositoryWatcher } from "../../repo/lifecycle/repository-watcher";
import { readImagePreview } from "../../repo/working-tree/image-preview";
import type { Services } from "../../services";
import { showOpenDialog } from "../dialogs";
import { invalidRequest } from "../request-errors";
import { broadcast, handle } from "../transport";
import {
  optionalInteger,
  requireAbsolutePath,
  requireId,
  requireRecord,
  requireString,
  requireStringArray,
} from "../validate";

export function registerRepositoryHandlers(services: Services): void {
  const { git, repositories } = services;

  handle(IPC_CHANNELS.repositoryReferenceUrl, async (_e, rawId, kind, rawName) => {
    const repository = repositories.resolveActiveRepository(requireId(rawId));

    if (kind !== "commit" && kind !== "branch" && kind !== "remote-branch" && kind !== "tag")
      throw invalidRequest(errorText("main.repositoryHandlers.chooseAReferenceKind"));

    let name = requireString(rawName, t("fields.referenceName"), 255);
    const result = await git.exec(["remote"], {
      cwd: repository.path,
      operation: t("operations.readRemoteNames"),
      maxStdoutBytes: 64 * 1024,
    });
    const names = result.stdout.trim().split("\n").filter(Boolean);
    const remote =
      kind === "remote-branch"
        ? names.sort((a, b) => b.length - a.length).find((remote) => name.startsWith(`${remote}/`))
        : names.includes("origin")
          ? "origin"
          : names[0];

    if (!remote) return ok(null);
    if (kind === "remote-branch") name = name.slice(remote.length + 1);

    const url = await git.readConfig(`remote.${remote}.url`, { cwd: repository.path });

    return ok(url ? referenceLink(url, kind, name) : null);
  });

  handle(IPC_CHANNELS.repositoryPreviewCommit, async (_e, id) =>
    ok(await services.writer.previewCommit(requireId(id))),
  );

  handle(IPC_CHANNELS.repositoryForgetRecovery, async (_e, id, snapshot) => {
    await services.writer.forgetRecovery(requireId(id), requireId(snapshot));
    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryIgnoredFiles, async (_event, rawId) => {
    const repository = repositories.resolveActiveRepository(requireId(rawId));
    const result = await git.exec(
      ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"],
      {
        cwd: repository.path,
        operation: t("operations.listIgnoredFiles"),
        maxStdoutBytes: 4 * 1024 * 1024,
      },
    );
    const paths = result.stdout.split("\0").filter(Boolean);

    return ok({ paths: paths.slice(0, 5000), truncated: paths.length > 5000 });
  });

  handle(IPC_CHANNELS.repositoryCommitTemplate, async (_event, rawId) => {
    const repository = repositories.resolveActiveRepository(requireId(rawId));
    const configured = await git.readConfig("commit.template", { cwd: repository.path });

    if (!configured) return ok(null);

    const path = configured.startsWith("~/")
      ? join(homedir(), configured.slice(2))
      : isAbsolute(configured)
        ? configured
        : resolve(repository.path, configured);
    const info = await stat(path);

    if (!info.isFile() || info.size > 100_000)
      throw invalidRequest(
        errorText("main.repositoryHandlers.theCommitTemplateMustBeATextFileUnder100Kb"),
      );

    const bytes = await readFile(path);

    if (bytes.length > 100_000)
      throw invalidRequest(errorText("main.repositoryHandlers.theCommitTemplateExceeds100Kb"));

    try {
      return ok(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw invalidRequest(errorText("main.repositoryHandlers.theCommitTemplateMustUseUtf8Text"));
    }
  });

  handle(
    IPC_CHANNELS.repositoryExportRecoveryFile,
    async (event, rawId, rawSnapshot, rawPath, stage) => {
      const path = requireString(rawPath, t("fields.savedFile"));

      if (stage !== undefined && (typeof stage !== "number" || ![0, 1, 2, 3].includes(stage)))
        throw invalidRequest(errorText("main.repositoryHandlers.chooseASavedIndexStage"));

      const bytes = services.writer.savedRecoveryFile(
        requireId(rawId),
        requireId(rawSnapshot),
        path,
        stage,
      );

      const window = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: t("main.repositoryHandlers.saveRecoveredFileCopy"),
        defaultPath: `${basename(path)}.recovered`,
      };
      const destination = await (window
        ? dialog.showSaveDialog(window, options)
        : dialog.showSaveDialog(options));

      if (destination.canceled || !destination.filePath) return ok(false);

      await writeFile(destination.filePath, bytes);

      return ok(true);
    },
  );

  handle(IPC_CHANNELS.repositoryPreviewDiscard, async (_e, id, paths) =>
    ok(
      await services.writer.previewDiscard(
        requireId(id),
        requireStringArray(paths, t("fields.filesToDiscard"), 256),
      ),
    ),
  );

  handle(IPC_CHANNELS.repositoryListRecovery, async (_e, id) =>
    ok(services.writer.listRecovery(requireId(id))),
  );

  handle(IPC_CHANNELS.repositoryApplyDiscard, async (_e, rawId, token) => {
    const id = requireId(rawId);
    await services.writer.applyDiscard(id, requireId(token));
    broadcast(IPC_EVENTS.repositoryChanged, id);
    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryRestoreContent, async (_e, rawId, snapshot) => {
    const id = requireId(rawId);
    await services.writer.restoreContent(id, requireId(snapshot));
    broadcast(IPC_EVENTS.repositoryChanged, id);
    return ok(undefined);
  });

  const ignoreKind = (kind: unknown) => {
    if (kind !== "path" && kind !== "extension" && kind !== "directory")
      throw invalidRequest(errorText("main.repositoryHandlers.chooseAnIgnoreRuleType"));
    return kind;
  };

  handle(IPC_CHANNELS.repositoryInspectIgnore, async (_e, id, path, kind) =>
    ok(
      await services.writer.inspectIgnore(
        requireId(id),
        requireString(path, t("fields.filePath")),
        ignoreKind(kind),
      ),
    ),
  );

  handle(IPC_CHANNELS.repositoryAddIgnore, async (_e, id, path, kind) => {
    const repositoryId = requireId(id);

    await services.writer.addIgnore(
      repositoryId,
      requireString(path, t("fields.filePath")),
      ignoreKind(kind),
    );
    broadcast(IPC_EVENTS.repositoryChanged, repositoryId);

    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryStopTracking, async (_e, id, path) => {
    const repositoryId = requireId(id);
    await services.writer.stopTracking(repositoryId, requireString(path, t("fields.filePath")));
    broadcast(IPC_EVENTS.repositoryChanged, repositoryId);
    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryUpdateMetadata, async (_event, rawId, rawMetadata) => {
    const metadata = requireRecord(rawMetadata, t("main.repositoryHandlers.repositoryMetadata"));

    if (typeof metadata["favourite"] !== "boolean")
      throw invalidRequest(errorText("main.repositoryHandlers.chooseAFavouriteState"));

    repositories.updateMetadata(
      requireId(rawId),
      requireString(metadata["name"], t("fields.repositoryName")),
      metadata["favourite"],
    );
    broadcast(IPC_EVENTS.repositoriesChanged);

    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryReveal, async (_event, rawId) => {
    const repository = repositories.resolveActiveRepository(requireId(rawId));
    const error = await shell.openPath(repository.path);

    if (error)
      throw invalidRequest(
        errorText(
          "main.repositoryHandlers.theRepositoryFolderCouldNotBeOpenedCheckThatItStillExists",
        ),
      );

    return ok(undefined);
  });

  const watcher = new RepositoryWatcher((repositoryId, warning) =>
    broadcast(IPC_EVENTS.repositoryChanged, repositoryId, warning),
  );

  services.identity.onChange(() => watcher.closeAll());

  handle(IPC_CHANNELS.repositoryWatch, async (_e, rawId) => {
    watcher.closeAll();
    if (rawId === null) return ok(undefined);
    const repository = repositories.resolveActiveRepository(
      requireId(rawId, t("fields.repositoryId")),
    );
    watcher.watch(repository.id, repository.path);
    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryApplyProfile, async (_event, rawId) => {
    const id = requireId(rawId);
    await services.writer.applyProfile(id);
    broadcast(IPC_EVENTS.repositoryChanged, id);
    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryClearLocalCommitConfig, async (_event, rawId, group) => {
    if (group !== "author" && group !== "signing" && group !== "all")
      throw invalidRequest(
        errorText("main.repositoryHandlers.chooseAuthorSigningOrBothLocalCommitSettings"),
      );
    const id = requireId(rawId);
    await services.writer.clearLocalCommitConfig(id, group);
    broadcast(IPC_EVENTS.repositoryChanged, id);
    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositorySuggestProfile, async (_event, path) =>
    ok(repositories.suggestIdentityForPath(requireAbsolutePath(path)) ?? null),
  );

  handle(IPC_CHANNELS.repositoryAssignProfile, async (_event, rawId, rawTarget, rawMove) => {
    if (typeof rawMove !== "boolean")
      throw invalidRequest(
        errorText("main.repositoryHandlers.chooseWhetherToKeepTheSourceMembership"),
      );

    const id = await services.profiles.assignRepository(
      requireId(rawId),
      requireId(rawTarget),
      rawMove,
    );

    broadcast(IPC_EVENTS.repositoriesChanged);

    return ok(id);
  });

  handle(IPC_CHANNELS.repositoryList, async () => ok(await repositories.listForActiveIdentity()));

  handle(IPC_CHANNELS.repositoryOpen, async (_e, rawPath) => {
    const summary = await repositories.open(requireAbsolutePath(rawPath));
    broadcast(IPC_EVENTS.repositoriesChanged);
    return ok(summary);
  });

  handle(IPC_CHANNELS.repositoryRelocate, async (_e, rawId, rawPath) => {
    const summary = await repositories.relocate(requireId(rawId), requireAbsolutePath(rawPath));
    broadcast(IPC_EVENTS.repositoriesChanged);
    return ok(summary);
  });

  handle(IPC_CHANNELS.repositoryInit, async (_e, rawPath, rawOptions) => {
    let options: InitRepositoryOptions | undefined;

    if (rawOptions !== undefined) {
      const input = requireRecord(
        rawOptions,
        t("main.repositoryHandlers.initialRepositoryOptions"),
      );
      const ignore = input["ignore"];
      const license = input["license"];

      if (
        typeof input["readme"] !== "boolean" ||
        (ignore !== "none" && ignore !== "node" && ignore !== "python") ||
        (license !== "none" && license !== "MIT")
      )
        throw invalidRequest(errorText("main.repositoryHandlers.chooseSupportedInitialFiles"));

      options = {
        branch: requireString(input["branch"], t("fields.initialBranch")),
        readme: input["readme"],
        ignore,
        license,
      };
    }

    const summary = await repositories.init(requireAbsolutePath(rawPath), options);

    broadcast(IPC_EVENTS.repositoriesChanged);

    return ok(summary);
  });

  handle(IPC_CHANNELS.repositoryRemove, async (_e, rawId) => {
    repositories.remove(requireId(rawId));
    broadcast(IPC_EVENTS.repositoriesChanged);
    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryStatus, async (_e, rawId) => {
    const repository = repositories.resolveActiveRepository(
      requireId(rawId, t("fields.repositoryId")),
    );
    const [status, capabilities] = await Promise.all([
      git.status(repository.path),
      repositoryCapabilities(git, repository.path),
    ]);
    const workflow = await services.workflows.observe(repository.path, status);

    return ok({ ...status, capabilities, workflow });
  });

  handle(IPC_CHANNELS.repositoryHistory, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.historyRequest"));
    const repository = repositories.resolveActiveRepository(
      requireId(input["repositoryId"], t("fields.repositoryId")),
    );
    const offset = optionalInteger(input["offset"], t("fields.historyOffset"), 0, 1_000_000);
    const limit = optionalInteger(
      input["limit"],
      t("fields.historyLimit"),
      1,
      MAX_HISTORY_PAGE_SIZE,
    );

    if (input["showStashes"] !== undefined && typeof input["showStashes"] !== "boolean")
      throw invalidRequest(errorText("main.repositoryHandlers.chooseWhetherToShowStashes"));

    return ok(
      await git.history(repository.path, {
        showStashes: input["showStashes"] === true,
        ...(offset !== undefined && { offset }),
        ...(limit !== undefined && { limit }),
        ...(input["refs"] !== undefined && {
          refs: requireStringArray(input["refs"], t("fields.graphReferences"), 256),
        }),
        ...(input["hiddenRefs"] !== undefined && {
          hiddenRefs: requireStringArray(input["hiddenRefs"], t("fields.hiddenReferences"), 256),
        }),
      }),
    );
  });

  handle(IPC_CHANNELS.repositoryInspectCommit, async (_e, id, oid) => {
    const repository = repositories.resolveActiveRepository(requireId(id));
    return ok(
      await git.inspectCommit(repository.path, requireString(oid, t("fields.commitObjectId"), 64)),
    );
  });

  handle(IPC_CHANNELS.repositoryWorkingDiff, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.workingDiffRequest"));
    const repository = repositories.resolveActiveRepository(
      requireId(input["repositoryId"], t("fields.repositoryId")),
    );
    const area = input["area"];

    if (area !== "staged" && area !== "unstaged")
      throw invalidRequest(errorText("main.repositoryHandlers.chooseAValidDiffArea"));

    return ok(
      await git.workingDiff(repository.path, {
        area,
        ...(input["paths"] !== undefined && {
          paths: requireStringArray(input["paths"], t("fields.paths"), 256),
        }),
      }),
    );
  });

  handle(IPC_CHANNELS.repositoryCommitDiff, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.commitDiffRequest"));
    const repository = repositories.resolveActiveRepository(
      requireId(input["repositoryId"], t("fields.repositoryId")),
    );

    return ok(
      await git.commitDiff(
        repository.path,
        requireString(input["oid"], t("fields.commitObjectId"), 64),
        input["paths"] === undefined
          ? undefined
          : requireStringArray(input["paths"], t("fields.paths"), 256),
      ),
    );
  });

  handle(IPC_CHANNELS.repositoryImagePreview, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.imagePreviewRequest"));
    const repository = repositories.resolveActiveRepository(
      requireId(input["repositoryId"], t("fields.repositoryId")),
    );
    const kind = input["kind"];

    if (kind !== "working" && kind !== "staged" && kind !== "commit")
      throw invalidRequest(errorText("main.repositoryHandlers.chooseAValidImageSource"));

    const request = {
      repositoryId: repository.id,
      path: requireString(input["path"], t("fields.imagePath"), 4096),
      ...(input["oldPath"] !== undefined && {
        oldPath: requireString(input["oldPath"], t("fields.originalImagePath"), 4096),
      }),
    };

    return ok(
      await readImagePreview(
        git,
        repository.path,
        kind === "commit"
          ? { ...request, kind, oid: requireString(input["oid"], t("fields.commitObjectId"), 64) }
          : { ...request, kind },
      ),
    );
  });

  handle(IPC_CHANNELS.repositoryChooseFolder, async (event) => {
    const result = await showOpenDialog(event, {
      properties: ["openDirectory", "createDirectory"],
    });

    return ok(result.canceled ? null : (result.filePaths[0] ?? null));
  });

  const writer = services.writer;
  const parsePartial = (raw: unknown): PartialStageRequest => {
    const input = requireRecord(raw, t("main.repositoryHandlers.partialStaging"));
    const area = input["area"];

    if (area !== "staged" && area !== "unstaged")
      throw invalidRequest(errorText("main.repositoryHandlers.chooseStagedOrUnstagedChanges"));

    const index = (raw: unknown) => {
      const value = optionalInteger(raw, t("fields.selectionIndex"), 0, 100_000);
      if (value === undefined)
        throw invalidRequest(errorText("main.repositoryHandlers.missingSelectionIndex"));
      return value;
    };
    const array = (raw: unknown): unknown[] => {
      if (raw === undefined) return [];
      if (!Array.isArray(raw) || raw.length > 12_000)
        throw invalidRequest(errorText("main.repositoryHandlers.tooManySelectedLines"));
      return raw;
    };

    return {
      repositoryId: requireId(input["repositoryId"]),
      path: requireString(input["path"], t("fields.filePath")),
      area,
      hunks: array(input["hunks"]).map(index),
      lines: array(input["lines"]).map((raw) => {
        const line = requireRecord(raw, t("main.repositoryHandlers.lineSelection"));
        return { hunk: index(line["hunk"]), line: index(line["line"]) };
      }),
    };
  };

  handle(IPC_CHANNELS.repositoryPreviewPartial, async (_event, raw) =>
    ok(await writer.previewPartial(parsePartial(raw))),
  );

  handle(IPC_CHANNELS.repositoryPreviewDiscardPartial, async (_event, raw) =>
    ok(await writer.previewDiscardPartial(parsePartial(raw))),
  );

  handle(IPC_CHANNELS.repositoryApplyPartial, async (_event, rawId, rawToken) => {
    const id = requireId(rawId);
    await writer.applyPartial(id, requireId(rawToken));
    broadcast(IPC_EVENTS.repositoryChanged, id);
    return ok(undefined);
  });

  const repoId = (raw: unknown) =>
    requireId(
      requireRecord(raw, t("main.repositoryHandlers.request"))["repositoryId"],
      t("fields.repositoryId"),
    );
  const optionalPaths = (raw: unknown) =>
    raw === undefined ? undefined : requireStringArray(raw, t("fields.paths"), 256);

  handle(IPC_CHANNELS.repositoryStage, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.stageRequest"));
    await writer.stage(repoId(raw), optionalPaths(input["paths"]));
    broadcast(IPC_EVENTS.repositoryChanged, input["repositoryId"]);
    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryUnstage, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.unstageRequest"));
    await writer.unstage(repoId(raw), optionalPaths(input["paths"]));
    broadcast(IPC_EVENTS.repositoryChanged, input["repositoryId"]);
    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryCommit, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.commitRequest"));
    const message = requireString(input["message"], t("fields.commitMessage"), 100_000);
    const options = { amend: input["amend"] === true, signOff: input["signOff"] === true };
    const stagePaths = optionalPaths(input["stagePaths"]);

    const result =
      stagePaths === undefined
        ? await writer.commit(repoId(raw), message, options)
        : await writer.stageAndCommit(repoId(raw), stagePaths, message, options);

    broadcast(IPC_EVENTS.repositoryChanged, input["repositoryId"]);

    return ok(result);
  });

  handle(IPC_CHANNELS.repositoryListBranches, async (_e, rawId) =>
    ok(await writer.listBranches(requireId(rawId, t("fields.repositoryId")))),
  );

  handle(IPC_CHANNELS.repositoryCreateBranch, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.branchRequest"));

    await writer.createBranch(
      repoId(raw),
      requireString(input["name"], t("fields.branchName"), 255),
      {
        checkout: input["checkout"] === true,
        ...(input["startPoint"] !== undefined && {
          startPoint: requireString(input["startPoint"], t("fields.startPoint"), 64),
        }),
      },
    );
    broadcast(IPC_EVENTS.repositoryChanged, input["repositoryId"]);

    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryCheckoutBranch, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.branchRequest"));
    await writer.checkoutBranch(
      repoId(raw),
      requireString(input["name"], t("fields.branchName"), 255),
    );
    broadcast(IPC_EVENTS.repositoryChanged, input["repositoryId"]);
    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryDeleteBranch, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.branchRequest"));
    await writer.deleteBranch(
      repoId(raw),
      requireString(input["name"], t("fields.branchName"), 255),
      {
        force: input["force"] === true,
      },
    );
    broadcast(IPC_EVENTS.repositoryChanged, input["repositoryId"]);
    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryRenameBranch, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.branchRequest"));

    await writer.renameBranch(
      repoId(raw),
      requireString(input["from"], t("fields.branchName"), 255),
      requireString(input["to"], t("fields.branchName"), 255),
    );
    broadcast(IPC_EVENTS.repositoryChanged, input["repositoryId"]);

    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryVerifyTag, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.tagVerification"));
    return ok(
      await writer.verifyTag(repoId(raw), requireString(input["name"], t("fields.tagName"), 255)),
    );
  });

  handle(IPC_CHANNELS.repositoryListTags, async (_e, rawId) =>
    ok(await writer.listTags(requireId(rawId, t("fields.repositoryId")))),
  );

  handle(IPC_CHANNELS.repositoryCreateTag, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.tagRequest"));

    await writer.createTag(repoId(raw), requireString(input["name"], t("fields.tagName"), 255), {
      sign: input["sign"] === true,
      ...(input["message"] !== undefined && {
        message: requireString(input["message"], t("fields.tagMessage"), 100_000),
      }),
      ...(input["target"] !== undefined && {
        target: requireString(input["target"], t("fields.target"), 64),
      }),
    });
    broadcast(IPC_EVENTS.repositoryChanged, input["repositoryId"]);

    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryDeleteTag, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.tagRequest"));
    await writer.deleteTag(repoId(raw), requireString(input["name"], t("fields.tagName"), 255));
    broadcast(IPC_EVENTS.repositoryChanged, input["repositoryId"]);
    return ok(undefined);
  });

  handle(IPC_CHANNELS.repositoryCheckoutTag, async (_e, raw) => {
    const input = requireRecord(raw, t("main.repositoryHandlers.tagRequest"));
    await writer.checkoutTag(repoId(raw), requireString(input["name"], t("fields.tagName"), 255));
    broadcast(IPC_EVENTS.repositoryChanged, input["repositoryId"]);
    return ok(undefined);
  });
}
