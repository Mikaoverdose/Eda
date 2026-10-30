import { t, type MessageKey } from "./index";
import type { WorkflowKind } from "../workflows/workflow";
import type { ReplayAction, ReplayKind } from "../workflows/replay";

const workflowKeys = {
  merge: "labels.workflow.merge",
  squash: "labels.workflow.squash",
  stash: "labels.workflow.stash",
  rebase: "labels.workflow.rebase",
  "cherry-pick": "labels.workflow.cherryPick",
  revert: "labels.workflow.revert",
  am: "labels.workflow.am",
  unknown: "labels.workflow.unknown",
} as const satisfies Record<WorkflowKind, MessageKey>;

export const workflowLabel = (kind: WorkflowKind): string => t(workflowKeys[kind]);

const stateKeys = {
  undo: "labels.action.undo",
  redo: "labels.action.redo",
  undoing: "labels.action.undoing",
  redoing: "labels.action.redoing",
  start: "labels.action.start",
  continue: "labels.action.continue",
  skip: "labels.action.skip",
  abort: "labels.action.abort",
  amend: "labels.action.amend",
  add: "labels.action.add",
  rename: "labels.action.rename",
  remove: "labels.action.remove",
  url: "labels.action.url",
  branch: "labels.action.branch",
  checkout: "labels.action.checkout",
  reset: "labels.action.reset",
  commit: "labels.action.commit",
  rebase: "labels.action.rebase",
  squash: "labels.action.squash",
  stash: "labels.action.stash",
  "cherry-pick": "labels.action.cherryPick",
  revert: "labels.action.revert",
  merge: "labels.action.merge",

  queued: "labels.state.queued",
  running: "labels.state.running",
  succeeded: "labels.state.succeeded",
  failed: "labels.state.failed",
  interrupted: "labels.state.interrupted",
  prepared: "labels.state.prepared",
  completed: "labels.state.completed",
  restored: "labels.state.restored",
  undone: "labels.state.undone",
  applied: "labels.state.applied",
  added: "labels.change.added",
  deleted: "labels.change.deleted",
  modified: "labels.change.modified",
  renamed: "labels.change.renamed",
  copied: "labels.change.copied",
  "type-changed": "labels.change.typeChanged",
  file: "labels.diff.file",
  notice: "labels.diff.notice",
  hunk: "labels.diff.hunk",
  context: "labels.diff.context",
  addition: "labels.diff.addition",
  deletion: "labels.diff.deletion",
  "no-newline": "labels.diff.noNewline",
} as const satisfies Record<string, MessageKey>;

export function stateLabel(value: string): string {
  return Object.hasOwn(stateKeys, value) ? t(stateKeys[value as keyof typeof stateKeys]) : value;
}

const replayKeys = {
  "cherry-pick": {
    start: "labels.replay.cherryPick.start",
    continue: "labels.replay.cherryPick.continue",
    skip: "labels.replay.cherryPick.skip",
    abort: "labels.replay.cherryPick.abort",
  },
  revert: {
    start: "labels.replay.revert.start",
    continue: "labels.replay.revert.continue",
    skip: "labels.replay.revert.skip",
    abort: "labels.replay.revert.abort",
  },
} as const satisfies Record<ReplayKind, Record<ReplayAction, MessageKey>>;

export const replayActionLabel = (kind: ReplayKind, action: ReplayAction): string =>
  t(replayKeys[kind][action]);
