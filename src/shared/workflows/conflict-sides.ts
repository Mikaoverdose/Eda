import { t } from "@shared/i18n";
import type { WorkflowKind } from "./workflow";

export function conflictSides(kind?: WorkflowKind) {
  switch (kind) {
    case "rebase":
      return {
        base: t("shared.conflictSides.parentOfTheReplayedCommit"),
        current: t("shared.conflictSides.rebasedHistorySoFar"),
        incoming: t("shared.conflictSides.replayedCommit"),
        explanation: t("shared.conflictSides.currentIsTheNewBasePlusCommitsAlready"),
      };
    case "cherry-pick":
      return {
        base: t("shared.conflictSides.parentOfThePickedCommit"),
        current: t("shared.conflictSides.destinationHistory"),
        incoming: t("shared.conflictSides.pickedCommit"),
        explanation: t("shared.conflictSides.currentIsTheDestinationHistoryIncludingEarlierPicks"),
      };
    case "revert":
      return {
        base: t("shared.conflictSides.commitBeingReverted"),
        current: t("shared.conflictSides.currentHistory"),
        incoming: t("shared.conflictSides.stateBeforeRevertedChange"),
        explanation: t("shared.conflictSides.currentKeepsThePresentHistoryIncomingIsThe"),
      };
    case "stash":
      return {
        base: t("shared.conflictSides.originalStashBase"),
        current: t("shared.conflictSides.destinationContent"),
        incoming: t("shared.conflictSides.stashedChanges"),
        explanation: t("shared.conflictSides.currentIsTheDestinationContentWhereTheStash"),
      };
    case "merge":
    case "squash":
      return {
        base: t("shared.conflictSides.mergeBase"),
        current: t("shared.conflictSides.currentHistory"),
        incoming:
          kind === "squash"
            ? t("shared.conflictSides.squashedSource")
            : t("shared.conflictSides.incomingHistory"),
        explanation: t("shared.conflictSides.currentIsTheDestinationSideIncomingIsThe"),
      };
    default:
      return {
        base: t("shared.conflictSides.baseContent"),
        current: t("shared.conflictSides.currentContent"),
        incoming: t("shared.conflictSides.incomingContent"),
        explanation: t("shared.conflictSides.theseAreGitSRecordedConflictStagesBase1"),
      };
  }
}
