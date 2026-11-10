import { Localized } from "@renderer/i18n/Localized";
import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { RepositorySummary } from "@shared/repository/repository";
import {
  ArrowUpRightIcon as ArrowUpRight,
  FolderOpenIcon as FolderOpen,
  PencilIcon as Pencil,
  SquareArrowOutUpRightIcon as SquareArrowOutUpRight,
  StarIcon as Star,
} from "../../components/ui/icons";
import { lazy, Suspense, useState } from "react";
import { ButtonBase } from "../../components/ui/actions/ButtonBase";
import {
  Button,
  Dialog,
  ErrorDialog,
  FolderIcon,
  IconButton,
  Input,
  SearchField,
} from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";
import { useShellStore } from "../../stores/shell-store";
import { InitRepositoryDialog } from "./InitRepositoryDialog";

const CloneRepositoryDialog = lazy(() =>
  import("../repository-dialogs").then((module) => ({ default: module.CloneRepositoryDialog })),
);

export function RepositoryHome() {
  const repositories = useAppStore((state) => state.repositories);
  const active = useAppStore((state) => state.activeIdentity);
  const addRepository = useAppStore((state) => state.addRepository);
  const selectRepository = useAppStore((state) => state.selectRepository);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [editing, setEditing] = useState<RepositorySummary | null>(null);
  const [alias, setAlias] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const matches = repositories.filter((repository) =>
    `${repository.name} ${repository.path}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  const update = async (repository: RepositorySummary, name: string, favourite: boolean) => {
    setBusy(true);
    setError(null);

    try {
      const result = await window.eda.repository.updateMetadata(repository.id, { name, favourite });

      if (!result.ok) setError(errorMessage(result.error));
      else {
        setEditing(null);
        await useAppStore.getState().refreshRepositories();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-surface-panel h-full overflow-y-auto">
      <div className="mx-auto max-w-[60rem] px-6 py-12">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{t("repositoryHome.repositories")}</h1>

            <p className="mt-2 text-sm text-text-tertiary">
              {t("repositoryHome.profileRepositoryCount", {
                name: active?.name,
                count: repositories.length,
              })}
            </p>
          </div>

          <div data-tour="repository-actions" className="flex gap-2">
            <Button size="sm" onClick={() => setCloning(true)}>
              {t("repositoryHome.cloneRepository")}
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              {t("repositoryHome.createRepository")}
            </Button>

            <Button
              size="sm"
              variant="primary"
              icon={<FolderIcon size={14} />}
              onClick={() => void addRepository()}
            >
              {t("repositoryHome.addARepository")}
            </Button>
          </div>
        </div>

        <SearchField
          size="md"
          aria-label={t("repositoryHome.filterRepositories")}
          placeholder={t("repositoryHome.searchByNameOrPath")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {!editing && <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>}

        {matches.length > 0 ? (
          <div data-tour="repository-list" className="border-t border-border-subtle">
            {matches.map((repository) => (
              <div
                key={repository.id}
                className="flex items-center gap-2 border-b border-border-subtle"
              >
                <ButtonBase
                  data-tour={`repository-open-${repository.id}`}
                  onClick={() => selectRepository(repository.id)}
                  aria-label={t("repositoryHome.open", { name: repository.name })}
                  className="group flex min-w-0 flex-1 items-center gap-3 px-2 py-4 text-left hover:bg-bg-inset"
                >
                  <FolderIcon size={16} className="shrink-0 text-text-tertiary" />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{repository.name}</span>

                    <span
                      className="mt-1 block truncate text-xs text-text-tertiary"
                      title={repository.path}
                    >
                      {repository.available
                        ? repository.path
                        : t("repositoryHome.folderUnavailableOpenToRetry")}
                    </span>
                  </span>

                  <ArrowUpRight
                    size={14}
                    className="shrink-0 text-text-tertiary"
                    aria-hidden="true"
                  />
                </ButtonBase>

                <IconButton
                  disabled={busy}
                  aria-label={`${repository.favourite ? t("repositoryHome.unfavourite") : t("repositoryHome.favourite")} ${repository.name}`}
                  aria-pressed={repository.favourite}
                  title={t("repositoryHome.favourite")}
                  onClick={() => void update(repository, repository.name, !repository.favourite)}
                  icon={<Star size={15} fill={repository.favourite ? "currentColor" : "none"} />}
                />

                <IconButton
                  aria-label={t("repositoryHome.rename", { name: repository.name })}
                  title={t("repositoryHome.editDisplayName")}
                  onClick={() => {
                    setEditing(repository);
                    setAlias(repository.name);
                  }}
                  icon={<Pencil size={15} />}
                />

                <IconButton
                  disabled={!repository.available}
                  aria-label={t("repositoryHome.reveal", { name: repository.name })}
                  title={t("repositoryHome.openFolder")}
                  onClick={() =>
                    void window.eda.repository.reveal(repository.id).then((result) => {
                      if (!result.ok) setError(errorMessage(result.error));
                    })
                  }
                  icon={<FolderOpen size={15} />}
                />

                <IconButton
                  disabled={!repository.available}
                  aria-label={t("repositoryHome.openInEditor", { name: repository.name })}
                  title={t("repositoryHome.openInConfiguredEditor")}
                  onClick={() =>
                    void window.eda.repository.openEditor(repository.id).then((result) => {
                      if (!result.ok) setError(errorMessage(result.error));
                    })
                  }
                  icon={<SquareArrowOutUpRight size={15} />}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="border-y border-border-subtle py-8 text-sm text-text-tertiary">
            {query
              ? t("repositoryHome.noMatchingRepositories")
              : t("repositoryHome.noRepositoriesInThisProfileAddALocalFolderToGetStarted")}
          </p>
        )}

        <p className="mt-4 flex items-center justify-end gap-2 text-xs text-text-tertiary">
          <Button variant="ghost" size="sm" onClick={() => useShellStore.getState().startTour()}>
            {t("repositoryHome.takeATour")}
          </Button>

          <Localized
            id="repositoryHome.quickOpen"
            values={{
              kbd: (
                <kbd className="rounded-sm border border-border-default px-1.5 py-0.5">
                  {t("repositoryHome.ctrlP")}
                </kbd>
              ),
            }}
          />
        </p>
      </div>

      {creating && <InitRepositoryDialog onClose={() => setCreating(false)} />}

      {cloning && (
        <Suspense fallback={null}>
          <CloneRepositoryDialog key={active?.id} onClose={() => setCloning(false)} />
        </Suspense>
      )}

      {editing && (
        <Dialog
          title={t("repositoryHome.repositoryDisplayName")}
          description={t("repositoryHome.thisAliasBelongsToThisProfileTheFolderOnDiskKeepsItsName")}
          onClose={() => setEditing(null)}
          footer={
            <Button
              disabled={busy || !alias.trim()}
              onClick={() => void update(editing, alias, editing.favourite)}
            >
              {t("repositoryHome.saveName")}
            </Button>
          }
        >
          <Input
            aria-label={t("repositoryHome.repositoryDisplayName")}
            value={alias}
            maxLength={120}
            onChange={(event) => setAlias(event.target.value)}
          />

          {error && <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>}
        </Dialog>
      )}
    </div>
  );
}
