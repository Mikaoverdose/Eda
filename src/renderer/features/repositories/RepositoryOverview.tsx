import { t } from "@shared/i18n";
import { RepositorySyncActions } from "../sync/RepositorySyncActions";
import { Skeleton } from "../../components/ui/feedback/Skeleton";
import { RepositoryWorkflowActions } from "../workflows/RepositoryWorkflowActions";
import { ArrowDown, ArrowUp, GitBranch, CircleAlert } from "lucide-react";
import type { RepositorySummary } from "@shared/repository/repository";
import { categorizeChanges, useRepositoryStore } from "../../stores/repository-store";
import { BranchMenu } from "../references/BranchMenu";
import { RefreshButton, TextButton } from "../../components/ui/index";
import { useState } from "react";
import { RemotesDialog } from "../sync/RemotesDialog";
import { ConflictDialog } from "../changes/ConflictDialog";
import { StashesDialog } from "../stashes/StashesDialog";

export function RepositoryOverview({
  repository,
  onOpenCommit,
  pending = false,
}: {
  repository: RepositorySummary;
  onOpenCommit?: () => void;
  pending?: boolean;
}) {
  const [remotesFor, setRemotesFor] = useState<string | null>(null);
  const [conflictsFor, setConflictsFor] = useState<string | null>(null);
  const [stashesFor, setStashesFor] = useState<string | null>(null);
  const status = useRepositoryStore((state) => state.status);
  const writing = useRepositoryStore((state) => state.writing);
  const truncated = useRepositoryStore((state) => state.truncatedChanges);
  const branch = status?.branch;
  const categories = categorizeChanges(status?.changes ?? []);
  const conflicts = categories.conflicted.length;

  return (
    <header
      data-tour="repository-overview"
      aria-label={t("repositoryOverview.repositoryOverview")}
      className="repository-overview app-surface-chrome flex h-9 min-w-0 shrink-0 items-center gap-4 border-b border-border-subtle bg-bg-surface px-3"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex min-w-0 shrink-0 items-center gap-2 text-xs">
          <h1 title={repository.path} className="max-w-32 truncate font-medium">
            {repository.name}
          </h1>
          <span className="text-text-tertiary">/</span>
          {pending ? (
            <Skeleton className="w-24" />
          ) : branch?.head ? (
            <BranchMenu head={branch.head} />
          ) : (
            <span className="flex items-center gap-1.5 text-git-modified">
              <GitBranch size={14} />
              {t("repositoryOverview.detachedHead", { oid: branch?.oid?.slice(0, 7) })}
            </span>
          )}
          {!pending && branch?.unborn && (
            <span className="text-xs text-text-tertiary">
              {t("repositoryOverview.noCommitsYet")}
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-2 text-xs text-text-tertiary">
          {pending ? (
            <Skeleton className="w-32" />
          ) : branch?.upstream ? (
            <>
              <span title={branch.upstream} className="max-w-48 truncate">
                {t("repositoryOverview.tracking", { upstream: branch.upstream })}
              </span>
              <span
                title={t("repositoryOverview.commitsAheadOfTheLocallyKnownUpstream")}
                className="flex shrink-0 items-center gap-1"
              >
                <ArrowUp size={12} />
                {branch.ahead}
              </span>
              <span
                title={t("repositoryOverview.commitsBehindTheLocallyKnownUpstream")}
                className="flex shrink-0 items-center gap-1"
              >
                <ArrowDown size={12} />
                {branch.behind}
              </span>
            </>
          ) : (
            <span className="truncate">
              {branch?.detached
                ? t("repositoryOverview.inspectingACommitOutsideABranch")
                : t("repositoryOverview.noUpstreamConfigured")}
            </span>
          )}
        </div>
      </div>
      <RepositorySyncActions />
      <div
        aria-label={t("repositoryOverview.repositoryActions")}
        className="flex min-w-0 flex-1 items-center justify-end gap-4 text-xs"
      >
        <TextButton
          className="text-text-secondary hover:text-text-primary"
          data-tour="stashes"
          onClick={() => setStashesFor(repository.id)}
        >
          {t("repositoryOverview.stashes")}
        </TextButton>
        <TextButton
          className="text-text-secondary hover:text-text-primary"
          onClick={() => setRemotesFor(repository.id)}
        >
          {t("repositoryOverview.remotes")}
        </TextButton>
        {onOpenCommit && (
          <TextButton className="text-accent-text" onClick={onOpenCommit}>
            {t("repositoryOverview.commitDraft")}
          </TextButton>
        )}
        {!pending && (
          <RepositoryWorkflowActions
            repositoryId={repository.id}
            workflow={status?.workflow}
            writing={writing}
            conflicts={conflicts}
          />
        )}
        {!pending && (
          <>
            {conflicts > 0 && (
              <TextButton
                className="text-git-conflict"
                onClick={() => setConflictsFor(repository.id)}
              >
                {t("repositoryOverview.resolveConflicts", { conflicts: conflicts })}
              </TextButton>
            )}
            {truncated && (
              <CircleAlert
                size={14}
                className="text-git-modified"
                aria-label={t("repositoryOverview.changeListIsTruncated")}
              />
            )}
          </>
        )}
        <RefreshButton
          label={t("repositoryOverview.refreshRepository")}
          disabled={pending || writing}
          onRefresh={async () => {
            const store = useRepositoryStore.getState();
            const id = store.repositoryId;
            const identityId = store.identityId;

            await store.refresh();

            const current = useRepositoryStore.getState();

            return (
              current.repositoryId === id &&
              current.identityId === identityId &&
              !current.error &&
              !current.historyError
            );
          }}
        />
      </div>
      {remotesFor === repository.id && (
        <RemotesDialog
          key={repository.id}
          repositoryId={repository.id}
          onClose={() => setRemotesFor(null)}
        />
      )}
      {conflictsFor === repository.id && (
        <ConflictDialog
          key={repository.id}
          repositoryId={repository.id}
          onClose={() => setConflictsFor(null)}
        />
      )}
      {stashesFor === repository.id && (
        <StashesDialog
          key={repository.id}
          repositoryId={repository.id}
          onClose={() => setStashesFor(null)}
        />
      )}
    </header>
  );
}
