import { t } from "@shared/i18n";
import type { GitErrorKind } from "@shared/errors";
import { GitError } from "@shared/errors";

interface Pattern {
  kind: GitErrorKind;
  test: RegExp;
  message: (context: MappingContext) => string;
  suggestedAction?: (context: MappingContext) => string;
}

export interface MappingContext {
  operation: string;
  repositoryPath?: string;
  identityName?: string;
  exitCode: number;
  stderr: string;
  stdout?: string;
}

const PATTERNS: readonly Pattern[] = [
  {
    kind: "network-failed",
    test: /ssl certificate problem|certificate.*(verify|issuer|subject|hostname)|SSL:|schannel:/i,
    message: () => t("main.git.errorMapping.theRemoteStlsCertificateCouldNotBeVerified"),
    suggestedAction: () => t("main.git.errorMapping.checkTheUrlAndYourMachineSTrusted"),
  },
  {
    kind: "invalid-input",
    test: /gpg failed to sign|failed to sign the data|couldn.t load public key|no secret key|signing failed|unable to sign the tag/i,
    message: () => t("main.git.errorMapping.gitCouldNotSignThisChangeWithTheSelectedKey"),
    suggestedAction: () => t("main.git.errorMapping.checkThisProfileSSigningKeyAndUnlock"),
  },
  {
    kind: "auth-failed",
    test: /permission denied \(publickey|could not read from remote repository|authentication failed|invalid username or (password|token)|access denied|host key verification failed|could not read Username|terminal prompts disabled|returned error: (401|403)/i,
    message: (c) =>
      c.identityName
        ? t("main.git.errorMapping.authenticationFailedForIdentity", {
            identityName: c.identityName,
          })
        : t("main.git.errorMapping.authenticationFailedForThisRemote"),
    suggestedAction: (c) =>
      /REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(c.stderr)
        ? t("main.git.errorMapping.theServerSHostKeyChangedConfirmThe")
        : /host key verification/i.test(c.stderr)
          ? t("main.git.errorMapping.theServerSHostKeyIsNotTrusted")
          : c.identityName
            ? t("main.git.errorMapping.checkSsshKeyAndAgentOrEnterAn", {
                identityName: c.identityName,
              })
            : t("main.git.errorMapping.checkYourSshKeyAndAgentOrEnter"),
  },
  {
    kind: "network-failed",
    test: /could not resolve host|connection timed out|connection refused|network is unreachable|failed to connect|operation timed out|temporary failure in name resolution|early eof|rpc failed|returned error: (407|5\d\d)|could not resolve proxy/i,
    message: () => t("main.git.errorMapping.couldNotReachTheRemoteRepository"),
    suggestedAction: () =>
      t("main.git.errorMapping.checkYourNetworkConnectionAndTheRemoteUrlThenTryAgain"),
  },
  {
    kind: "lock-contention",
    test: /unable to create '.*\.lock': file exists|another git process seems to be running|index\.lock/i,
    message: () => t("main.git.errorMapping.anotherGitProcessIsUsingThisRepository"),
    suggestedAction: () => t("main.git.errorMapping.waitForItToFinishIfNoOther"),
  },
  {
    kind: "merge-conflict",
    test: /conflict \(|automatic merge failed|fix conflicts and then commit|needs merge/i,
    message: () => t("main.git.errorMapping.theMergeProducedConflicts"),
    suggestedAction: () => t("main.git.errorMapping.resolveTheConflictingFilesThenCommitTheResult"),
  },
  {
    kind: "non-fast-forward",
    test: /non-fast-forward|failed to push some refs|tip of your current branch is behind|fetch first|updates were rejected/i,
    message: () =>
      t("main.git.errorMapping.theRemoteRejectedThisUpdateItsHistoryOrLeaseMayHaveChanged"),
    suggestedAction: () => t("main.git.errorMapping.fetchAndReviewTheDestinationHistoryForThe"),
  },
  {
    kind: "nothing-to-commit",
    test: /nothing to commit|no changes added to commit|nothing added to commit/i,
    message: () => t("main.git.errorMapping.thereIsNothingStagedToCommit"),
    suggestedAction: () => t("main.git.errorMapping.stageTheChangesYouWantToIncludeThenCommit"),
  },
  {
    kind: "dirty-working-tree",
    test: /your local changes .* would be overwritten|please commit your changes or stash them|cannot pull with rebase: you have unstaged changes|contains modified or untracked files/i,
    message: () => t("main.git.errorMapping.thisWouldOverwriteUncommittedChangesInYourWorkingTree"),
    suggestedAction: () => t("main.git.errorMapping.commitOrStashYourChangesFirst"),
  },
  {
    kind: "no-upstream",
    test: /no upstream (branch|configured)|there is no tracking information|no configured push destination|does not appear to be a git repository.*\n.*please make sure/i,
    message: () => t("main.git.errorMapping.thisBranchIsNotTrackingARemoteBranch"),
    suggestedAction: () =>
      t("main.git.errorMapping.chooseARemoteToPushToAndEdaWillSetItAsTheUpstream"),
  },
  {
    kind: "not-a-repository",
    test: /not a git repository|fatal: cannot change to|does not exist/i,
    message: (c) =>
      c.repositoryPath
        ? t("main.git.errorMapping.isNotAGitRepository", { repositoryPath: c.repositoryPath })
        : t("main.git.errorMapping.thatFolderIsNotAGitRepository"),
    suggestedAction: () =>
      t("main.git.errorMapping.itMayHaveBeenMovedOrDeletedRemoveItFromEdaOrOpenADifferentFolder"),
  },
  {
    kind: "repository-corrupt",
    test: /object file .* is empty|loose object .* is corrupt|bad object|unable to read tree|did not send all necessary objects|packfile .* (is corrupt|cannot be)/i,
    message: () => t("main.git.errorMapping.thisRepositoryHasCorruptOrMissingObjects"),
    suggestedAction: () =>
      t("main.git.errorMapping.runGitFsckToInspectTheDamageAFreshCloneMayBeTheFastestFix"),
  },
  {
    kind: "config-write-refused",
    test: /could not lock config file|could not write config file|permission denied.*gitconfig|cannot overwrite multiple values/i,
    message: () => t("main.git.errorMapping.gitRefusedToWriteItsConfigurationFile"),
    suggestedAction: () => t("main.git.errorMapping.checkThatYourGitconfigIsWritableAndIs"),
  },
];

export function mapGitError(context: MappingContext): GitError {
  const stderr = context.stderr.trim();
  const searchable = `${stderr}\n${context.stdout?.trim() ?? ""}`.trim();

  for (const pattern of PATTERNS) {
    if (pattern.test.test(searchable)) {
      return new GitError({
        kind: pattern.kind,
        operation: context.operation,
        message: pattern.message(context),
        ...(pattern.suggestedAction && { suggestedAction: pattern.suggestedAction(context) }),
        ...(context.repositoryPath !== undefined && { repositoryPath: context.repositoryPath }),
        exitCode: context.exitCode,
        rawStderr: stderr,
      });
    }
  }

  return new GitError({
    kind: "unknown",
    operation: context.operation,
    message:
      firstMeaningfulLine(stderr) ??
      t("main.git.errorMapping.theOperationFailed", { operation: context.operation }),
    suggestedAction: t("main.git.errorMapping.ifThisKeepsHappeningTheFullGitOutputIsInEdaSLog"),
    ...(context.repositoryPath !== undefined && { repositoryPath: context.repositoryPath }),
    exitCode: context.exitCode,
    rawStderr: stderr,
  });
}

function firstMeaningfulLine(stderr: string): string | undefined {
  const lines = stderr
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !/^(warning|hint):/i.test(l));
  const line = [...lines.filter((l) => /^(fatal|error):/i.test(l)), ...lines]
    .map((l) =>
      l
        .replace(/^fatal:\s*/i, "")
        .replace(/^error:\s*/i, "")
        .trim(),
    )
    .find((l) => l.length > 0);

  if (!line) return undefined;

  return line.charAt(0).toUpperCase() + line.slice(1);
}
