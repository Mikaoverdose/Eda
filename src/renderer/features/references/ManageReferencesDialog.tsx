import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { useEffect, useRef, useState } from "react";
import {
  captureRepositoryCommand,
  repositoryCommandDispatcher,
  repositoryCommandReason,
} from "../../commands/repository-commands";
import {
  Button,
  Checkbox,
  CheckboxControl,
  Dialog,
  ErrorDialog,
  Input,
} from "../../components/ui/index";
import { useRepositoryStore } from "../../stores/repository-store";

type Item = { name: string; kind: "branch" | "tag"; unavailable?: string };

export function ManageReferencesDialog({
  repositoryId,
  onClose,
}: {
  repositoryId: string;
  onClose: () => void;
}) {
  const commandContext = captureRepositoryCommand(repositoryId ?? "");
  const dispatch = repositoryCommandDispatcher(commandContext);
  const commandUnavailable = repositoryCommandReason(commandContext);
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ key: string; message: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void Promise.all([
      window.eda.repository.listBranches(repositoryId),
      window.eda.repository.listTags(repositoryId),
    ]).then(([branches, tags]) => {
      if (!alive.current) return;

      if (!branches.ok || !tags.ok) {
        setError(t("manageReferencesDialog.referencesCouldNotBeLoaded"));
        return;
      }

      setItems([
        ...branches.value
          .filter((ref) => !ref.remote)
          .map((ref): Item => ({
            name: ref.name,
            kind: "branch",
            ...(ref.isHead || ref.worktreePath
              ? {
                  unavailable: t("manageReferencesDialog.checkedOut", {
                    value1: ref.worktreePath
                      ? t("manageReferencesDialog.in", { worktreePath: ref.worktreePath })
                      : "",
                  }),
                }
              : {}),
          })),
        ...tags.value.map((ref): Item => ({ name: ref.name, kind: "tag" })),
      ]);
    });

    return () => {
      alive.current = false;
    };
  }, [repositoryId]);

  const matches = items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  const groups = new Map<string, Item[]>();

  for (const item of matches.slice(0, 200)) {
    const key = `${item.kind}, ${item.name.includes("/") ? item.name.slice(0, item.name.lastIndexOf("/")) : "(root)"}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const remove = async () => {
    if (!confirmed) return;

    if (commandUnavailable) {
      setError(commandUnavailable);
      return;
    }

    setBusy(true);
    setResults([]);

    try {
      for (const item of items.filter((item) => selected.includes(`${item.kind}:${item.name}`))) {
        if (!alive.current) break;

        const result =
          item.kind === "branch"
            ? await dispatch("deleteBranch", { repositoryId, name: item.name })
            : await dispatch("deleteTag", { repositoryId, name: item.name });

        if (!alive.current) break;

        setResults((rows) => [
          ...rows,
          {
            key: `${item.kind}:${item.name}`,
            message: result.ok
              ? t("manageReferencesDialog.deletedLocally")
              : errorMessage(result.error),
          },
        ]);

        if (result.ok) setItems((rows) => rows.filter((row) => row !== item));
      }

      if (alive.current && useRepositoryStore.getState().repositoryId === repositoryId)
        await useRepositoryStore.getState().syncFromDisk();
    } finally {
      if (alive.current) {
        setBusy(false);
        setSelected([]);
        setConfirmed(false);
      }
    }
  };

  return (
    <Dialog
      title={t("manageReferencesDialog.manageLocalReferences")}
      description={t("manageReferencesDialog.selectUpTo100LocalBranchesOrTagsUnmerged")}
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {busy ? t("manageReferencesDialog.stopAfterCurrentAction") : t("common.close")}
          </Button>
          <Button
            disabled={!!commandUnavailable || busy || !confirmed || selected.length === 0}
            onClick={() => void remove()}
          >
            {t("manageReferencesDialog.deleteSelectedReferences", { length: selected.length })}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <Input
          aria-label={t("manageReferencesDialog.filterReferenceGroups")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("manageReferencesDialog.branchTagOrFolder")}
        />
        <div className="max-h-64 overflow-auto">
          {[...groups].map(([group, rows]) => (
            <fieldset key={group} className="mb-3">
              <legend className="py-1 text-xs font-semibold text-text-tertiary">{group}</legend>
              {rows.map((item) => {
                const key = `${item.kind}:${item.name}`;

                return (
                  <label key={key} className="flex gap-2 py-1 text-xs" title={item.unavailable}>
                    <CheckboxControl
                      checked={selected.includes(key)}
                      disabled={
                        !!commandUnavailable ||
                        busy ||
                        !!item.unavailable ||
                        (!selected.includes(key) && selected.length >= 100)
                      }
                      onChange={(event) => {
                        setSelected(
                          event.target.checked
                            ? [...selected, key]
                            : selected.filter((name) => name !== key),
                        );
                        setConfirmed(false);
                      }}
                    />
                    <span className="min-w-0 break-all">
                      {item.name}
                      {item.unavailable && `, ${item.unavailable}`}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
        {matches.length > 200 && (
          <p className="text-xs">
            {t("manageReferencesDialog.showing200MatchesRefineTheFilterToSeeMore")}
          </p>
        )}
        <Checkbox
          className="flex gap-2"
          checked={confirmed}
          disabled={busy || !!commandUnavailable}
          onChange={(event) => setConfirmed(event.target.checked)}
        >
          {t("manageReferencesDialog.deleteTheseLocalReferences")}
        </Checkbox>
        <div aria-live="polite" className="max-h-40 overflow-auto text-xs">
          {results.map((result) => (
            <p key={result.key} className="break-all">
              {result.key}: {result.message}
            </p>
          ))}
        </div>
        {error && <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>}
      </div>
    </Dialog>
  );
}
