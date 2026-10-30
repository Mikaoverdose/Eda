import { t } from "@shared/i18n";
import type { BranchSummary } from "@shared/repository/repository-write";
import type { RemoteState } from "@shared/integrations/remotes";

export function branchDeleteTargets(branch: BranchSummary, state: RemoteState) {
  const current = state.branches.find(
    (item) => item.name === branch.name && item.remote === branch.remote,
  );
  const remoteRef = branch.remote ? current?.name : current?.upstream;
  const remote = state.remotes
    .filter((item) => remoteRef?.startsWith(`${item.name}/`))
    .sort((a, b) => b.name.length - a.name.length)[0];
  const destination = remote && remoteRef ? remoteRef.slice(remote.name.length + 1) : undefined;
  const locals =
    branch.remote && remoteRef
      ? state.branches.filter((item) => !item.remote && item.upstream === remoteRef)
      : [];
  const local = branch.remote
    ? (locals.find((item) => item.name === destination) ??
      (locals.length === 1 ? locals[0] : undefined))
    : current;
  const localBlocked = local?.isHead
    ? t("branchDeleteTargets.checkOutAnotherBranchBeforeDeletingThisLocalBranch")
    : local?.worktreePath
      ? t("branchDeleteTargets.thisBranchIsCheckedOutInSwitchThatWorktreeToAnotherBranchFirst", {
          worktreePath: local.worktreePath,
        })
      : undefined;

  return {
    local,
    localBlocked,
    remote: remote && destination ? { name: remote.name, branch: destination } : undefined,
  };
}
