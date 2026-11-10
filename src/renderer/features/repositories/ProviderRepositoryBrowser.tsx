import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type {
  ProviderRepository,
  RepositoryProvider,
} from "@shared/integrations/provider-repositories";
import {
  ArchiveIcon as Archive,
  BookMarkedIcon as BookMarked,
  CheckIcon as Check,
  LockKeyholeIcon as LockKeyhole,
} from "../../components/ui/icons";
import { useEffect, useRef, useState } from "react";
import {
  ActionIndicator,
  Button,
  ListItemButton,
  SearchField,
  Select,
  StateMessage,
} from "../../components/ui/index";

export function ProviderRepositoryBrowser({
  profileId,
  provider,
  baseUrl,
  selectedUrl,
  disabled,
  onSelect,
}: {
  profileId: string;
  provider: RepositoryProvider;
  baseUrl?: string | undefined;
  selectedUrl: string;
  disabled: boolean;
  onSelect: (repository: ProviderRepository) => void;
}) {
  const scrollArea = useRef<HTMLDivElement>(null);
  const loadTrigger = useRef<HTMLDivElement>(null);

  const [repositories, setRepositories] = useState<ProviderRepository[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const [filter, setFilter] = useState("all");

  const [page, setPage] = useState(1);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError(null);

    const request = baseUrl
      ? window.eda.gitlabSelfHosted.repositories(profileId, baseUrl, page)
      : window.eda[provider].repositories(profileId, page);

    void request
      .then((result) => {
        if (!active) return;

        if (!result.ok) {
          setError(errorMessage(result.error));
          return;
        }

        setRepositories((previous) => {
          const combined =
            page === 1 ? result.value.repositories : [...previous, ...result.value.repositories];

          return [...new Map(combined.map((repository) => [repository.id, repository])).values()];
        });

        setNextPage(result.value.nextPage);
      })
      .catch(() => {
        if (active) setError(t("cloneRepositoryDialog.loadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [profileId, provider, baseUrl, page, attempt]);

  useEffect(() => {
    const root = scrollArea.current;
    const trigger = loadTrigger.current;

    if (!root || !trigger || !nextPage || loading || error || disabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setPage(nextPage);
      },
      { root, rootMargin: "160px 0px" },
    );

    observer.observe(trigger);

    return () => observer.disconnect();
  }, [nextPage, loading, error, disabled, query, filter, sort]);

  const search = query.trim().toLocaleLowerCase();

  const filtered = repositories
    .filter((repository) => {
      const matchesQuery = `${repository.fullName} ${repository.description ?? ""}`
        .toLocaleLowerCase()
        .includes(search);

      const matchesFilter =
        filter === "all" ||
        (filter === "private" && repository.private) ||
        (filter === "public" && !repository.private) ||
        (filter === "archived" && repository.archived);

      return matchesQuery && matchesFilter;
    })
    .sort((a, b) => {
      if (sort === "name")
        return (
          a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) ||
          a.fullName.localeCompare(b.fullName)
        );

      if (sort === "nameDescending")
        return (
          b.name.localeCompare(a.name, undefined, { sensitivity: "base", numeric: true }) ||
          b.fullName.localeCompare(a.fullName)
        );

      return (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0);
    });

  return (
    <div className="space-y-3">
      <SearchField
        size="md"
        aria-label={t("cloneRepositoryDialog.searchRepositories")}
        placeholder={t("cloneRepositoryDialog.searchRepositories")}
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="grid grid-cols-2 gap-2">
        <Select
          aria-label={t("cloneRepositoryDialog.filterRepositories")}
          compact
          value={filter}
          onValueChange={setFilter}
          disabled={disabled}
          className="w-full"
        >
          <option value="all">{t("cloneRepositoryDialog.allRepositories")}</option>
          <option value="private">{t("cloneRepositoryDialog.privateOnly")}</option>
          <option value="public">{t("cloneRepositoryDialog.publicOnly")}</option>
          <option value="archived">{t("cloneRepositoryDialog.archivedOnly")}</option>
        </Select>

        <Select
          aria-label={t("cloneRepositoryDialog.sortRepositories")}
          compact
          value={sort}
          onValueChange={setSort}
          disabled={disabled}
          className="w-full"
        >
          <option value="updated">{t("cloneRepositoryDialog.recentlyUpdated")}</option>
          <option value="name">{t("cloneRepositoryDialog.nameAscending")}</option>
          <option value="nameDescending">{t("cloneRepositoryDialog.nameDescending")}</option>
        </Select>
      </div>

      <div
        ref={scrollArea}
        className="h-[17rem] overflow-y-auto rounded-lg border border-border-subtle bg-bg-inset p-1.5"
        aria-busy={loading}
      >
        {loading && repositories.length === 0 ? (
          <StateMessage
            tone="loading"
            className="h-full"
            title={t("cloneRepositoryDialog.loadingRepositories")}
          />
        ) : (
          <>
            {filtered.map((repository) => (
              <ListItemButton
                key={repository.id}
                selected={selectedUrl === repository.cloneUrl}
                aria-pressed={selectedUrl === repository.cloneUrl}
                disabled={disabled}
                className="gap-3 rounded-md px-3 py-3"
                onClick={() => onSelect(repository)}
              >
                <BookMarked size={17} aria-hidden="true" className="shrink-0 text-text-tertiary" />

                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium" title={repository.fullName}>
                      {repository.fullName}
                    </span>

                    {repository.private && (
                      <LockKeyhole
                        size={12}
                        aria-label={t("cloneRepositoryDialog.privateRepository")}
                        className="shrink-0 text-text-tertiary"
                      />
                    )}

                    {repository.archived && (
                      <Archive
                        size={12}
                        aria-label={t("cloneRepositoryDialog.archivedRepository")}
                        className="shrink-0 text-text-tertiary"
                      />
                    )}
                  </span>

                  {repository.description && (
                    <span className="block truncate text-xs leading-relaxed text-text-tertiary">
                      {repository.description}
                    </span>
                  )}
                </span>

                {selectedUrl === repository.cloneUrl && (
                  <Check size={16} aria-hidden="true" className="shrink-0 text-accent-text" />
                )}
              </ListItemButton>
            ))}

            {!filtered.length && !error && (loading || nextPage) && (
              <StateMessage
                tone="loading"
                className="min-h-48"
                title={t("cloneRepositoryDialog.loadingRepositories")}
              />
            )}

            {!filtered.length && !error && !loading && !nextPage && (
              <StateMessage
                title={t(
                  query || filter !== "all"
                    ? "cloneRepositoryDialog.noMatches"
                    : "cloneRepositoryDialog.noRepositories",
                )}
              />
            )}

            {error && (
              <StateMessage
                tone="error"
                title={t("cloneRepositoryDialog.loadFailed")}
                description={error}
                action={
                  <Button
                    size="sm"
                    disabled={disabled || loading}
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    {t("cloneRepositoryDialog.tryAgain")}
                  </Button>
                }
              />
            )}
          </>
        )}

        <div ref={loadTrigger} aria-hidden="true" className="h-px" />
      </div>

      <div className="flex min-h-7 items-center justify-between gap-3">
        <p role="status" className="text-xs text-text-tertiary">
          {t("cloneRepositoryDialog.filteredCount", {
            shown: filtered.length,
            total: repositories.length,
          })}
        </p>

        {loading && repositories.length > 0 && (
          <span role="status" className="flex items-center gap-2 text-xs text-text-tertiary">
            <ActionIndicator state="pending" />
            {t("cloneRepositoryDialog.loadingMore")}
          </span>
        )}
      </div>
    </div>
  );
}
