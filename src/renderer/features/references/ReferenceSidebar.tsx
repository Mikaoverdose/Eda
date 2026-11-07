import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { BranchSummary, TagSummary } from "@shared/repository/repository-write";
import { GitBranch, Globe, PanelLeftClose, PanelLeftOpen, Tag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLayoutTransition } from "../../components/layout/hooks/useLayoutTransition";
import { Skeleton, SkeletonRows } from "../../components/ui/feedback/Skeleton";
import {
  cx,
  Disclosure,
  ErrorDialog,
  IconButton,
  ListItemButton,
  SearchField,
  TextButton,
} from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";
import { useRepositoryStore } from "../../stores/repository-store";
import { useSessionStore } from "../../stores/session-store";
import { useTagReferences } from "./hooks/useTagReferences";
import { ManageReferencesDialog } from "./ManageReferencesDialog";
import { ReferenceMenu, type ReferenceTarget } from "./ReferenceMenu";

const defaults = { hidden: false, locals: true, remotes: true, tags: true };

export function ReferenceSidebar({
  repositoryId,
  compact = false,
  pending = false,
  forceExpanded = false,
  onExpand,
}: {
  repositoryId: string;
  compact?: boolean;
  pending?: boolean;
  forceExpanded?: boolean;
  onExpand?: () => void;
}) {
  const transition = useLayoutTransition();
  const [manageOpen, setManageOpen] = useState(false);
  const profileId = useAppStore((state) => state.activeIdentity?.id);
  const status = useRepositoryStore((state) => state.status);
  const selection = useRepositoryStore((state) => state.selection);
  const saved = useSessionStore(
    (state) => state.snapshot?.session.views[repositoryId]?.references ?? defaults,
  );
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [localTags, setTags] = useState<TagSummary[]>([]);
  const [query, setQuery] = useState("");
  const [actions, setActions] = useState<ReferenceTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const tags = useTagReferences(repositoryId, profileId, localTags, revision, pending);

  useEffect(() => {
    if (pending) return;

    let cancelled = false;

    setLoading(true);
    setError(null);
    void Promise.all([
      window.eda.repository.listBranches(repositoryId),
      window.eda.repository.listTags(repositoryId),
    ])
      .then(([branchResult, tagResult]) => {
        if (cancelled) return;

        setBranches(branchResult.ok ? branchResult.value : []);
        setTags(tagResult.ok ? tagResult.value : []);

        const session = useSessionStore.getState();
        const filter = session.snapshot?.session.views[repositoryId]?.graphFilter;

        if (filter?.pinnedRef && branchResult.ok && tagResult.ok) {
          const branch = branchResult.value.find(
            (item) => `refs/${item.remote ? "remotes" : "heads"}/${item.name}` === filter.pinnedRef,
          );
          const tag = tagResult.value.find((item) => `refs/tags/${item.name}` === filter.pinnedRef);
          const oid = branch?.oid ?? tag?.oid;

          if (oid !== filter.pinnedOid) {
            session.setView(repositoryId, {
              graphFilter: { ...filter, pinnedOid: oid, pinnedRef: oid ? filter.pinnedRef : null },
            });
            void useRepositoryStore.getState().refresh();
          }
        }

        if (!branchResult.ok) setError(errorMessage(branchResult.error));
        else if (!tagResult.ok) setError(errorMessage(tagResult.error));
      })
      .catch(() => {
        if (!cancelled) setError(t("referenceSidebar.referencesCouldNotBeReadTryRefreshing"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repositoryId, profileId, status, revision, pending]);

  const toggle = (key: keyof typeof defaults) => {
    const update = () =>
      useSessionStore
        .getState()
        .setView(repositoryId, { references: { ...saved, [key]: !saved[key] } });

    if (key === "hidden") transition(update);
    else update();
  };
  const collapsed = !forceExpanded && (saved.hidden || compact);
  const sidebarWidth = forceExpanded ? "w-full" : collapsed ? "w-9" : "w-[200px]";
  const contentWidth = forceExpanded ? "w-full" : "w-[200px]";
  const sidebar = useRef<HTMLElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  const focusToggle = useRef(false);

  useEffect(() => {
    const element = sidebar.current;

    if (element && (focusToggle.current || element.contains(document.activeElement))) {
      (collapsed ? expandButton : collapseButton).current?.focus();
    }

    focusToggle.current = false;
  }, [collapsed]);

  const groups = [
    {
      key: "locals" as const,
      label: t("referenceSidebar.localBranches"),
      icon: GitBranch,
      items: branches.filter((branch) => !branch.remote),
    },
    {
      key: "remotes" as const,
      label: t("referenceSidebar.remoteBranches"),
      icon: Globe,
      items: branches.filter((branch) => branch.remote),
    },
    { key: "tags" as const, label: t("referenceSidebar.tags"), icon: Tag, items: tags },
  ];

  return (
    <aside
      data-tour="references"
      ref={sidebar}
      onClickCapture={(event) => {
        if (
          collapsed ||
          (event.target instanceof Element &&
            event.target.closest('[data-reference-toggle="collapse"]'))
        )
          focusToggle.current = true;
      }}
      aria-label={t("referenceSidebar.repositoryReferences")}
      data-layout-region=""
      data-collapsed={collapsed}
      className={cx(
        "reference-sidebar app-surface-panel relative min-h-0 shrink-0 overflow-hidden border-r border-border-subtle",
        sidebarWidth,
      )}
    >
      <div
        className="reference-sidebar-rail absolute inset-y-0 left-0 flex w-9 flex-col items-center pt-3"
        inert={!collapsed}
        aria-hidden={!collapsed}
      >
        <IconButton
          ref={expandButton}
          onClick={() => (compact ? onExpand?.() : toggle("hidden"))}
          title={t("referenceSidebar.showBranchesAndTags")}
          aria-label={t("referenceSidebar.showBranchesAndTags")}
          data-reference-toggle="expand"
          icon={<PanelLeftOpen size={16} />}
        />
        {[
          {
            key: "locals" as const,
            label: t("referenceSidebar.localBranches"),
            icon: GitBranch,
            count: branches.filter((branch) => !branch.remote).length,
          },
          {
            key: "remotes" as const,
            label: t("referenceSidebar.remoteBranches"),
            icon: Globe,
            count: branches.filter((branch) => branch.remote).length,
          },
          {
            key: "tags" as const,
            label: t("referenceSidebar.tags"),
            icon: Tag,
            count: tags.length,
          },
        ].map(({ key, label, icon: Icon, count }) => (
          <ListItemButton
            key={key}
            title={`${label}: ${count}`}
            aria-label={`${label}: ${count}`}
            className="mt-3 flex-col gap-0 p-1 text-text-tertiary"
            onClick={() =>
              compact
                ? onExpand?.()
                : transition(() =>
                    useSessionStore.getState().setView(repositoryId, {
                      references: { ...saved, hidden: false, [key]: true },
                    }),
                  )
            }
          >
            <Icon size={15} aria-hidden="true" />
            <span className="text-xs">{count}</span>
          </ListItemButton>
        ))}
      </div>
      <div
        className={cx("reference-sidebar-content flex h-full min-h-0 flex-col", contentWidth)}
        inert={collapsed}
        aria-hidden={collapsed}
      >
        <header className="flex h-10 shrink-0 items-center justify-between px-3">
          <h2 className="text-xs font-semibold text-text-secondary">
            {t("referenceSidebar.repository")}
          </h2>
          <IconButton
            ref={collapseButton}
            size="xs"
            onClick={() => (forceExpanded ? onExpand?.() : toggle("hidden"))}
            title={t("referenceSidebar.hideBranchesAndTags")}
            aria-label={t("referenceSidebar.hideBranchesAndTags")}
            data-reference-toggle="collapse"
            icon={<PanelLeftClose size={14} />}
          />
        </header>
        {actions && (
          <ReferenceMenu
            key={`${profileId}:${repositoryId}:${actions.kind}:${actions.ref.name}`}
            repositoryId={repositoryId}
            target={actions}
            onClose={() => setActions(null)}
            onChanged={() => setRevision((value) => value + 1)}
          />
        )}
        {manageOpen && (
          <ManageReferencesDialog
            repositoryId={repositoryId}
            onClose={() => setManageOpen(false)}
          />
        )}
        <SearchField
          className="mx-3 mb-3 bg-bg-base"
          aria-label={t("referenceSidebar.filterBranchesAndTags")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("referenceSidebar.findABranch")}
        />
        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          {error && (
            <ErrorDialog>
              {error}{" "}
              <TextButton onClick={() => setRevision((value) => value + 1)}>
                {t("common.retry")}
              </TextButton>
            </ErrorDialog>
          )}
          {groups.map((group) => {
            const items = group.items.filter((item) =>
              item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()),
            );

            return (
              <Disclosure
                key={group.key}
                className="mb-2"
                summaryClassName="px-3 py-2 text-xs font-medium"
                open={saved[group.key]}
                onToggle={(event) => {
                  if (event.currentTarget.open !== saved[group.key]) toggle(group.key);
                }}
                title={
                  <>
                    <group.icon size={13} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">{group.label}</span>
                    <span className="mono ml-auto flex h-4 w-6 shrink-0 items-center justify-center text-text-tertiary">
                      {loading && branches.length === 0 ? (
                        <Skeleton className="w-5" />
                      ) : (
                        group.items.length
                      )}
                    </span>
                  </>
                }
              >
                <div className="px-1">
                  {loading && branches.length === 0 ? (
                    <div
                      role="status"
                      aria-label={t("referenceSidebar.loading", {
                        label: group.label.toLowerCase(),
                      })}
                    >
                      <SkeletonRows rows={3} />
                    </div>
                  ) : (
                    <>
                      {items.slice(0, 200).map((item) => {
                        const tag = "isHead" in item ? null : item;
                        const tagTarget = tag
                          ? {
                              kind: "tag" as const,
                              ref: tag,
                              local: tag.local,
                              remoteNames: tag.remotes.map((remote) => remote.name),
                              ...(!tag.local && tag.remotes[0]
                                ? { remoteName: tag.remotes[0].name, remoteOid: tag.remotes[0].oid }
                                : {}),
                            }
                          : null;
                        const tagStatus = tag
                          ? [
                              tag.local ? t("referenceSidebar.localTagIndicator") : "",
                              tag.remotes.length
                                ? t("referenceSidebar.remoteTagIndicator", {
                                    remotes: tag.remotes.map((remote) => remote.name).join(", "),
                                  })
                                : "",
                              tag.unknownRemotes.length
                                ? t("referenceSidebar.remoteTagUnavailable", {
                                    remotes: tag.unknownRemotes.join(", "),
                                  })
                                : "",
                            ]
                              .filter(Boolean)
                              .join("\n")
                          : "";
                        const head = "isHead" in item && item.isHead === true;
                        const selected = selection?.kind === "commit" && selection.oid === item.oid;
                        const displayName =
                          tag && !tag.local && tag.remotes[0]
                            ? `${tag.remotes[0].name}/${item.name}`
                            : item.name;

                        return (
                          <ListItemButton
                            key={item.name}
                            title={[
                              t("referenceSidebar.inspect", {
                                name: item.name,
                                value2: head ? t("referenceSidebar.currentBranch") : "",
                                oid: item.oid.slice(0, 8),
                              }),
                              tagStatus,
                            ]
                              .filter(Boolean)
                              .join("\n")}
                            aria-label={t("referenceSidebar.inspectReference", {
                              value1:
                                group.key === "tags"
                                  ? t("referenceSidebar.tag")
                                  : t("referenceSidebar.branch"),
                              name: item.name,
                            })}
                            aria-pressed={selected}
                            onClick={(event) => {
                              if (tagTarget && !tagTarget.local) {
                                const bounds = event.currentTarget.getBoundingClientRect();
                                setActions({ ...tagTarget, x: bounds.right, y: bounds.top });
                              } else void useRepositoryStore.getState().jumpToCommit(item.oid);
                            }}
                            onMouseEnter={() =>
                              useRepositoryStore.setState({ hoveredRefOid: item.oid })
                            }
                            onMouseLeave={() =>
                              useRepositoryStore.setState({ hoveredRefOid: null })
                            }
                            onFocus={() => useRepositoryStore.setState({ hoveredRefOid: item.oid })}
                            onBlur={() => useRepositoryStore.setState({ hoveredRefOid: null })}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              setActions(
                                "isHead" in item
                                  ? {
                                      kind: "branch",
                                      ref: item,
                                      x: event.clientX,
                                      y: event.clientY,
                                    }
                                  : { ...tagTarget!, x: event.clientX, y: event.clientY },
                              );
                            }}
                            onKeyDown={(event) => {
                              if (
                                event.key === "ContextMenu" ||
                                (event.shiftKey && event.key === "F10")
                              ) {
                                event.preventDefault();
                                const bounds = event.currentTarget.getBoundingClientRect();
                                setActions(
                                  "isHead" in item
                                    ? { kind: "branch", ref: item, x: bounds.right, y: bounds.top }
                                    : { ...tagTarget!, x: bounds.right, y: bounds.top },
                                );
                              }
                            }}
                            selected={selected}
                            className="py-1.5 pl-[51px] text-xs"
                          >
                            <span
                              className={cx(
                                "min-w-0 flex-1 truncate",
                                head && "font-medium text-accent-text",
                              )}
                            >
                              {displayName}
                            </span>
                            {tag?.localOnly && (
                              <span
                                className="shrink-0 rounded-sm bg-bg-raised px-1.5 py-0.5 text-xs leading-none text-text-secondary"
                                title={tagStatus}
                              >
                                {t("referenceSidebar.localLocation")}
                              </span>
                            )}
                          </ListItemButton>
                        );
                      })}
                      {!loading && items.length === 0 && (
                        <p className="py-1 pl-[51px] pr-2 text-xs text-text-tertiary">
                          {query ? t("referenceSidebar.noMatches") : t("referenceSidebar.noneYet")}
                        </p>
                      )}
                      {items.length > 200 && (
                        <p className="px-3 py-2 text-xs text-text-tertiary">
                          {t("referenceSidebar.showing200OfFilterToFindAReference", {
                            length: items.length,
                          })}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </Disclosure>
            );
          })}
        </div>
        <p className="border-t border-border-subtle px-3 py-3 text-xs leading-relaxed text-text-tertiary">
          <TextButton tone="accent" onClick={() => setManageOpen(true)}>
            {t("referenceSidebar.manageLocalReferences")}
          </TextButton>
        </p>
      </div>
    </aside>
  );
}
