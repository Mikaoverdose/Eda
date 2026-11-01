import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { diffPaths } from "@shared/repository/diff-paths";
import type {
  StashArea,
  StashContents,
  StashInspection,
  StashList,
} from "@shared/workflows/stashes";
import { useEffect, useRef, useState } from "react";
import { useRepositoryStore } from "../../../stores/repository-store";

export function useStashesDialog(repositoryId: string) {
  const listRevision = useRef(0);
  const running = useRef(false);
  const mounted = useRef(false);
  const inspectionRevision = useRef(0);
  const contextRevision = useRef(0);
  const [list, setList] = useState<StashList>({ entries: [], truncated: false });
  const [inspection, setInspection] = useState<StashInspection | null>(null);
  const [area, setArea] = useState<StashArea>("tracked");
  const [restorePath, setRestorePath] = useState("");
  const [restoreDialog, setRestoreDialog] = useState(false);
  const [branchDialog, setBranchDialog] = useState(false);
  const [renameDialog, setRenameDialog] = useState(false);
  const [name, setName] = useState("");
  const [contents, setContents] = useState<StashContents>("tracked");
  const [scope, setScope] = useState<"all" | "selected" | "staged">("all");
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [keepIndex, setKeepIndex] = useState(false);
  const changes = useRepositoryStore((state) => state.status?.changes);
  const eligiblePaths = (changes ?? []).filter(
    (change) =>
      change.kind !== "unmerged" &&
      change.kind !== "ignored" &&
      (contents !== "tracked" || change.kind !== "untracked"),
  );

  const [confirmed, setConfirmed] = useState(false);
  const [restoreIndex, setRestoreIndex] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    const revision = ++listRevision.current;

    inspectionRevision.current++;
    setInspection(null);
    setConfirmed(false);

    try {
      const result = await window.eda.stashes.list(repositoryId);

      if (revision !== listRevision.current) return;
      if (result.ok) setList(result.value);
      else setError(errorMessage(result.error));
    } catch (error) {
      if (revision === listRevision.current) setError(errorMessage(error));
    }
  };

  useEffect(() => {
    mounted.current = true;
    running.current = false;
    setList({ entries: [], truncated: false });
    setBusy(false);
    setError(null);
    setNotice(null);
    setSelectedPaths([]);
    setRestoreDialog(false);
    setBranchDialog(false);
    setRenameDialog(false);
    void load();
    return () => {
      mounted.current = false;
      listRevision.current++;
      inspectionRevision.current++;
      contextRevision.current++;
    };
  }, [repositoryId]);

  const inspect = async (selector: string) => {
    if (!mounted.current || running.current) return;
    const entry = list.entries.find((item) => item.selector === selector);

    if (!entry) return;

    const revision = ++inspectionRevision.current;

    setBusy(true);
    setError(null);
    setConfirmed(false);
    setInspection(null);

    try {
      const result = await window.eda.stashes.inspect(repositoryId, entry.selector, entry.oid);
      if (revision !== inspectionRevision.current) return;
      if (result.ok) setInspection(result.value);
      else setError(errorMessage(result.error));
    } catch (error) {
      if (revision === inspectionRevision.current) setError(errorMessage(error));
    } finally {
      if (revision === inspectionRevision.current) setBusy(false);
    }
  };

  const run = async (action: "create" | "drop") => {
    if (!mounted.current || running.current) return;
    running.current = true;
    const context = contextRevision.current;

    setBusy(true);
    setError(null);

    try {
      const result =
        action === "create"
          ? await window.eda.stashes.create(
              repositoryId,
              name,
              scope === "staged" ? "tracked" : contents,
              {
                stagedOnly: scope === "staged",
                keepIndex: scope !== "staged" && keepIndex,
                ...(scope === "selected"
                  ? {
                      paths: eligiblePaths
                        .filter((change) => selectedPaths.includes(change.path))
                        .map((change) => change.path),
                    }
                  : {}),
              },
            )
          : inspection
            ? await window.eda.stashes.drop(repositoryId, inspection.token)
            : null;

      if (!result) return;
      if (context !== contextRevision.current) return;

      await useRepositoryStore.getState().syncFromDisk();
      if (context !== contextRevision.current) return;

      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }

      if (action === "create") {
        setName("");
        setSelectedPaths([]);
      }

      await load();
    } catch (error) {
      if (context === contextRevision.current) setError(errorMessage(error));
    } finally {
      if (context === contextRevision.current) {
        running.current = false;
        setBusy(false);
      }
    }
  };

  const diff = inspection?.[area];
  const restorePaths = diffPaths(diff ?? null);

  const selectedRestorePath = restorePaths.includes(restorePath)
    ? restorePath
    : (restorePaths[0] ?? "");
  const apply = async (pop: boolean) => {
    if (!inspection || !mounted.current || running.current) return;
    running.current = true;
    const context = contextRevision.current;

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await window.eda.stashes.apply(
        repositoryId,
        inspection.token,
        pop,
        restoreIndex,
      );

      if (context !== contextRevision.current) return;

      await useRepositoryStore.getState().syncFromDisk();
      if (context !== contextRevision.current) return;

      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }

      setNotice(
        !result.value.applied
          ? t("stashes.useStashesDialog.applicationNeedsAttentionTheStashWasKeptClose")
          : result.value.kept
            ? t("stashes.useStashesDialog.changesAppliedTheStashWasKept")
            : t("stashes.useStashesDialog.changesAppliedAndTheStashWasRemoved"),
      );
      await load();
    } catch (error) {
      if (context === contextRevision.current) setError(errorMessage(error));
    } finally {
      if (context === contextRevision.current) {
        running.current = false;
        setBusy(false);
      }
    }
  };

  return {
    list,
    inspection,
    area,
    setArea,
    restorePath,
    setRestorePath,
    restoreDialog,
    setRestoreDialog,
    branchDialog,
    setBranchDialog,
    renameDialog,
    setRenameDialog,
    name,
    setName,
    contents,
    setContents,
    scope,
    setScope,
    selectedPaths,
    setSelectedPaths,
    keepIndex,
    setKeepIndex,
    changes,
    eligiblePaths,
    confirmed,
    setConfirmed,
    restoreIndex,
    setRestoreIndex,
    notice,
    setNotice,
    busy,
    error,
    load,
    inspect,
    run,
    diff,
    restorePaths,
    selectedRestorePath,
    apply,
  };
}
