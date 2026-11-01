import { t, type MessageKey, type MessageValues } from "./i18n";

export const ERROR_CODE = {
  GIT_VERSION_UNSUPPORTED: "GIT_VERSION_UNSUPPORTED",
  UPDATER_UNAVAILABLE: "UPDATER_UNAVAILABLE",
  INVALID_STABLE_VERSION: "INVALID_STABLE_VERSION",
  UNSUPPORTED_GIT_BUNDLE: "UNSUPPORTED_GIT_BUNDLE",
  GIT_PROCESS_FAILED: "GIT_PROCESS_FAILED",
  INVALID_GIT_OUTPUT: "INVALID_GIT_OUTPUT",
  PREPARED_INDEX_MISSING: "PREPARED_INDEX_MISSING",
  INVALID_DIFF_OUTPUT: "INVALID_DIFF_OUTPUT",
  INVALID_DIFF_PATH: "INVALID_DIFF_PATH",
  INVALID_HISTORY_OUTPUT: "INVALID_HISTORY_OUTPUT",
  INVALID_STATUS_OUTPUT: "INVALID_STATUS_OUTPUT",
  SSH_AGENT_TIMEOUT: "SSH_AGENT_TIMEOUT",
  INVALID_SSH_AGENT_RESPONSE: "INVALID_SSH_AGENT_RESPONSE",
  SSH_AGENT_START_FAILED: "SSH_AGENT_START_FAILED",
  SSH_AGENT_EXITED: "SSH_AGENT_EXITED",
  IDENTITY_NOT_RECORDED: "IDENTITY_NOT_RECORDED",
  DEBUG_IPC_FAILURE: "DEBUG_IPC_FAILURE",
  MIGRATION_TRANSACTION_REQUIRED: "MIGRATION_TRANSACTION_REQUIRED",
  INVALID_MIGRATION_ORDER: "INVALID_MIGRATION_ORDER",
  MIGRATION_HISTORY_MISMATCH: "MIGRATION_HISTORY_MISMATCH",
  INVALID_FOREIGN_KEYS: "INVALID_FOREIGN_KEYS",
  REWRITE_RECOVERY_REF_CHANGED: "REWRITE_RECOVERY_REF_CHANGED",
  REWRITE_BRANCH_MISMATCH: "REWRITE_BRANCH_MISMATCH",
  REWRITE_RECOVERY_ALREADY_SET: "REWRITE_RECOVERY_ALREADY_SET",
  ENCRYPTION_VERIFICATION_FAILED: "ENCRYPTION_VERIFICATION_FAILED",
  INVALID_VAULT_FORMAT: "INVALID_VAULT_FORMAT",
  BRANCH_TARGETS_NOT_READY: "BRANCH_TARGETS_NOT_READY",
  TRACKED_BRANCH_MISSING: "TRACKED_BRANCH_MISSING",
  REMOTE_BROWSER_URL_UNAVAILABLE: "REMOTE_BROWSER_URL_UNAVAILABLE",
  DEBUG_RENDER_FAILURE: "DEBUG_RENDER_FAILURE",
  DEBUG_RUNTIME_FAILURE: "DEBUG_RUNTIME_FAILURE",
  DEBUG_UNHANDLED_REJECTION: "DEBUG_UNHANDLED_REJECTION",
  ROOT_ELEMENT_MISSING: "ROOT_ELEMENT_MISSING",
  TUTORIAL_ISOLATION_REQUIRED: "TUTORIAL_ISOLATION_REQUIRED",
  CLIPBOARD_COPY_FAILED: "CLIPBOARD_COPY_FAILED",
} as const;
export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];
export const ERROR_MESSAGE_KEYS = {
  [ERROR_CODE.GIT_VERSION_UNSUPPORTED]: "main.git.gitEngine.versionIsOlderThanTheRequired",
  [ERROR_CODE.UPDATER_UNAVAILABLE]: "main.nativeUpdater.theNativeUpdaterIsUnavailable",
  [ERROR_CODE.INVALID_STABLE_VERSION]: "main.updateService.invalidStableReleaseVersion",
  [ERROR_CODE.UNSUPPORTED_GIT_BUNDLE]: "main.git.bundledGit.unsupportedGitBundle",
  [ERROR_CODE.GIT_PROCESS_FAILED]: "main.git.gitEngine.exited",
  [ERROR_CODE.INVALID_GIT_OUTPUT]: "main.git.gitEngine.unrecognizedOutput",
  [ERROR_CODE.PREPARED_INDEX_MISSING]: "main.git.lockedIndex.noPreparedIndexIsAvailableToPublish",
  [ERROR_CODE.INVALID_DIFF_OUTPUT]: "main.git.diffParser.malformedGitUnifiedDiffOutput",
  [ERROR_CODE.INVALID_DIFF_PATH]: "main.git.diffParser.malformedGitUnifiedDiffPath",
  [ERROR_CODE.INVALID_HISTORY_OUTPUT]: "main.git.logParser.malformedGitHistoryOutput",
  [ERROR_CODE.INVALID_STATUS_OUTPUT]: "main.git.statusParser.malformedGitStatusOutput",
  [ERROR_CODE.SSH_AGENT_TIMEOUT]: "main.git.sshAgent.sshAgentStartupTimedOut",
  [ERROR_CODE.INVALID_SSH_AGENT_RESPONSE]: "main.git.sshAgent.unrecognizedSshAgentResponse",
  [ERROR_CODE.SSH_AGENT_START_FAILED]: "main.git.sshAgent.couldNotStartSshAgent",
  [ERROR_CODE.SSH_AGENT_EXITED]: "main.git.sshAgent.sshAgentExitedBeforeItWasReady",
  [ERROR_CODE.IDENTITY_NOT_RECORDED]: "main.identity.identityManager.gitDidNotRecordCorrectly",
  [ERROR_CODE.DEBUG_IPC_FAILURE]: "main.applicationHandlers.edaDebugSimulationUnexpectedIpcError",
  [ERROR_CODE.MIGRATION_TRANSACTION_REQUIRED]: "main.persistence.migrate.transactionRequired",
  [ERROR_CODE.INVALID_MIGRATION_ORDER]: "main.persistence.migrate.invalidOrder",
  [ERROR_CODE.MIGRATION_HISTORY_MISMATCH]: "main.persistence.migrate.historyMismatch",
  [ERROR_CODE.INVALID_FOREIGN_KEYS]: "main.persistence.migrate.invalidForeignKeys",
  [ERROR_CODE.REWRITE_RECOVERY_REF_CHANGED]:
    "main.rewriteHistory.aRequiredRewriteRecoveryRefIsMissingOrChanged",
  [ERROR_CODE.REWRITE_BRANCH_MISMATCH]:
    "main.rewriteHistory.theCompletedRewriteIsNotCheckedOutOnItsRecordedBranch",
  [ERROR_CODE.REWRITE_RECOVERY_ALREADY_SET]:
    "main.rewriteHistory.thisRecordAlreadyHasReferenceOrResetRecovery",
  [ERROR_CODE.ENCRYPTION_VERIFICATION_FAILED]:
    "main.secrets.keychainSecretStore.encryptionRoundTripFailed",
  [ERROR_CODE.INVALID_VAULT_FORMAT]: "main.secrets.keychainSecretStore.invalidVaultFormat",
  [ERROR_CODE.BRANCH_TARGETS_NOT_READY]: "referenceMenu.waitForBranchTargetsToLoad",
  [ERROR_CODE.TRACKED_BRANCH_MISSING]: "referenceMenu.noTrackedRemoteBranchIsConfigured",
  [ERROR_CODE.REMOTE_BROWSER_URL_UNAVAILABLE]:
    "referenceMenu.noSupportedBrowserUrlIsAvailableForTheDefaultRemote",
  [ERROR_CODE.DEBUG_RENDER_FAILURE]:
    "settings.failureSimulations.edaDebugSimulationReactRenderError",
  [ERROR_CODE.DEBUG_RUNTIME_FAILURE]:
    "settings.failureSimulations.edaDebugSimulationUncaughtRuntimeError",
  [ERROR_CODE.DEBUG_UNHANDLED_REJECTION]:
    "settings.failureSimulations.edaDebugSimulationUnhandledPromiseRejection",
  [ERROR_CODE.ROOT_ELEMENT_MISSING]: "main.rootElementIsMissingFromIndexHtml",
  [ERROR_CODE.TUTORIAL_ISOLATION_REQUIRED]:
    "tutorial.demoRoot.theTourRequiresAnIsolatedFrameWithoutDesktopAccess",
  [ERROR_CODE.CLIPBOARD_COPY_FAILED]: "copyButton.clipboardCopyFailed",
} as const satisfies Record<ErrorCode, MessageKey>;

export interface ErrorText {
  readonly key: MessageKey;
  readonly values?: MessageValues;
}
export function errorText(key: MessageKey, values?: MessageValues): ErrorText {
  return { key, ...(values === undefined ? {} : { values }) };
}
export function resolveErrorText(text: ErrorText): string {
  return t(text.key, text.values);
}
