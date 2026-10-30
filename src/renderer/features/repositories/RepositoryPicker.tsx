import { t } from "@shared/i18n";
import { useState } from "react";
import { useAppStore } from "../../stores/app-store";
import {
  Button,
  FolderIcon,
  SearchField,
  PlusIcon,
  ListItemButton,
} from "../../components/ui/index";
import { useListNavigation } from "../../components/ui/hooks/useListNavigation";
import { RemoveRepositoryButton } from "./RemoveRepositoryButton";
import { InitRepositoryDialog } from "./InitRepositoryDialog";
import { ModalSurface, ModalTitle } from "../../components/ui/overlays/ModalSurface";

export function RepositoryPicker({ onClose }: { onClose: () => void }) {
  const repositories = useAppStore((s) => s.repositories);
  const active = useAppStore((s) => s.activeIdentity);
  const selectedId = useAppStore((s) => s.selectedRepositoryId);
  const selectRepository = useAppStore((s) => s.selectRepository);
  const addRepository = useAppStore((s) => s.addRepository);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? repositories.filter(
        (r) => r.name.toLowerCase().includes(needle) || r.path.toLowerCase().includes(needle),
      )
    : repositories;

  const choose = (id: string) => {
    selectRepository(id);
    onClose();
  };
  const { index, setHighlight, onKeyDown } = useListNavigation(matches.length, (position) => {
    const target = matches[position];
    if (target) choose(target.id);
  });

  if (creating) return <InitRepositoryDialog onClose={onClose} />;

  return (
    <ModalSurface
      onClose={onClose}
      placement="top"
      className="flex max-h-[60vh] w-[calc(100vw-2rem)] max-w-lg flex-col overflow-hidden rounded-lg border border-border-default"
    >
      <ModalTitle className="sr-only">{t("repositoryPicker.openARepository")}</ModalTitle>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border-subtle p-2">
          <SearchField
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlight(0);
            }}
            placeholder={t("repositoryPicker.searchRepositories", { value1: active?.name ?? "" })}
            aria-label={t("repositoryPicker.searchLabel")}
            onKeyDown={onKeyDown}
          />
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto p-1">
          {matches.map((repository, position) => (
            <li key={repository.id} className="flex items-center gap-1">
              <ListItemButton
                onClick={() => choose(repository.id)}
                onMouseEnter={() => setHighlight(position)}
                aria-current={repository.id === selectedId ? "true" : undefined}
                selected={position === index}
                className={
                  !repository.available ? "flex-1 px-2.5 py-2 opacity-60" : "flex-1 px-2.5 py-2"
                }
              >
                <span aria-hidden="true" className="shrink-0 text-text-tertiary">
                  <FolderIcon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {repository.name}
                    {!repository.available && (
                      <span className="ml-2 text-xs font-normal text-git-deleted">
                        {t("repositoryPicker.missing")}
                      </span>
                    )}
                  </span>
                  <span className="mono block truncate text-xs text-text-tertiary">
                    {repository.path}
                  </span>
                </span>
              </ListItemButton>
              <RemoveRepositoryButton repository={repository} compact />
            </li>
          ))}

          {matches.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-text-tertiary">
              {repositories.length === 0
                ? t("repositoryPicker.noRepositoriesUnderYet", {
                    value1: active?.name ?? t("repositoryPicker.thisIdentity"),
                  })
                : t("repositoryPicker.nothingMatches", { query: query })}
            </li>
          )}
        </ul>

        <div className="shrink-0 border-t border-border-subtle p-1.5">
          <Button variant="ghost" block className="justify-start" onClick={() => setCreating(true)}>
            {t("repositoryPicker.createARepository")}
          </Button>
          <Button
            variant="ghost"
            block
            icon={<PlusIcon size={14} />}
            className="justify-start"
            onClick={() => {
              onClose();
              void addRepository();
            }}
          >
            {t("repositoryPicker.addARepositoryFromDisk")}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
