import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { useEffect, useState } from "react";
import { ArchiveIcon, ArchiveRestoreIcon } from "../../components/ui/icons";
import { Button } from "../../components/ui/index";
import { useRepositoryStore } from "../../stores/repository-store";

export function StashActions({ pending = false }: { pending?: boolean }) {
  const repositoryId = useRepositoryStore((state) => state.repositoryId);
  const generation = useRepositoryStore((state) => state.generation);
  const status = useRepositoryStore((state) => state.status);
  const phase = useRepositoryStore((state) => state.phase);
  const writing = useRepositoryStore((state) => state.writing);
  const notice = useRepositoryStore((state) => state.stashNotice);
  const writeError = useRepositoryStore((state) => state.writeError);
  const [hasStashes, setHasStashes] = useState<boolean | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setHasStashes(null);
    setListError(null);

    if (repositoryId && phase === "ready" && !pending)
      void window.eda.stashes.list(repositoryId).then(
        (result) => {
          if (!current) return;
          if (result.ok) setHasStashes(result.value.entries.length > 0);
          else setListError(errorMessage(result.error));
        },
        (error: unknown) => {
          if (current) setListError(errorMessage(error));
        },
      );

    return () => {
      current = false;
    };
  }, [repositoryId, generation, status, phase, pending]);

  const blocked =
    pending ||
    phase !== "ready" ||
    writing ||
    status?.capabilities?.write === false ||
    !!status?.workflow ||
    status?.branch.unborn ||
    status?.changes.some((change) => change.kind === "unmerged");
  const hasChanges = status?.changes.some((change) => change.kind !== "ignored");
  const feedback = writeError ? errorMessage(writeError) : (listError ?? notice);

  return (
    <div
      role="group"
      aria-label={t("stashActions.stashActions")}
      className="flex shrink-0 items-center gap-1"
    >
      <Button
        variant="ghost"
        size="sm"
        data-tour="stashes"
        icon={<ArchiveIcon size={14} />}
        disabled={blocked || !hasChanges}
        title={t("stashActions.stashAllChanges")}
        onClick={() => void useRepositoryStore.getState().stash()}
      >
        {t("stashActions.stash")}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        icon={<ArchiveRestoreIcon size={14} />}
        disabled={blocked || hasStashes === false}
        title={feedback ?? t("stashActions.popLatestStash")}
        onClick={() => void useRepositoryStore.getState().popStash()}
      >
        {t("stashActions.pop")}
      </Button>

      <span role="status" className="sr-only">
        {feedback}
      </span>
    </div>
  );
}
