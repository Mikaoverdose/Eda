import { t } from "@shared/i18n";
import { defaultGraphFilter } from "@shared/preferences/graph-view";
import { useRef, useState } from "react";
import { AnchoredPopover, Button, MenuItem } from "../../components/ui/index";
import { CheckIcon, ChevronDownIcon } from "../../components/ui/icons";
import { usePreferencesStore } from "../../stores/preferences-store";
import { useRepositoryStore } from "../../stores/repository-store";
import { useSessionStore } from "../../stores/session-store";
import { openSettings } from "../../stores/shell-store";

export function GraphVisibilityMenu({
  repositoryId,
  disabled,
  onFilter,
}: {
  repositoryId: string;
  disabled: boolean;
  onFilter: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const filter = useSessionStore(
    (state) => state.snapshot?.session.views[repositoryId]?.graphFilter,
  );
  const globalDefault = usePreferencesStore((state) => state.values.showInternalRefs.value);
  const showInternalRefs = filter?.showInternalRefs ?? globalDefault;
  const filtered = !!(filter?.refs.length || filter?.hiddenRefs.length);
  const scopeLabel = showInternalRefs
    ? t("historyRefs.allReferencesMenu")
    : t("commitGraph.allBranches");

  const select = (showInternalRefs: boolean | undefined) => {
    useSessionStore.getState().setView(repositoryId, {
      graphFilter: {
        ...defaultGraphFilter(),
        showStashes: filter?.showStashes ?? true,
        showInternalRefs,
      },
    });
    void useRepositoryStore.getState().refresh();
  };

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <>
      <Button
        ref={trigger}
        size="sm"
        variant="ghost"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("historyRefs.historyReferences")}
        onClick={() => setOpen(!open)}
      >
        {filtered ? t("commitGraph.filteredGraph") : scopeLabel}
        <ChevronDownIcon size={12} aria-hidden="true" />
      </Button>

      {open && (
        <AnchoredPopover
          role="menu"
          aria-label={t("historyRefs.historyReferences")}
          anchorRef={trigger}
          returnFocusRef={trigger}
          placement="bottom-start"
          onClose={close}
          className="w-64 p-1"
        >
          {[
            {
              value: undefined,
              label: t("historyRefs.useGlobalDefault", {
                value: globalDefault
                  ? t("historyRefs.allReferences")
                  : t("historyRefs.branchesAndTags"),
              }),
            },
            { value: false, label: t("historyRefs.branchesAndTags") },
            { value: true, label: t("historyRefs.allReferences") },
          ].map(({ value, label }) => (
            <MenuItem
              key={label}
              aria-current={!filtered && filter?.showInternalRefs === value ? "true" : undefined}
              onClick={() => {
                close();
                select(value);
              }}
            >
              <CheckIcon
                size={14}
                aria-hidden="true"
                className={!filtered && filter?.showInternalRefs === value ? "" : "opacity-0"}
              />
              {label}
            </MenuItem>
          ))}

          <div className="my-1 border-t border-border-subtle" />
          <MenuItem
            onClick={() => {
              close();
              onFilter();
            }}
          >
            {t("historyRefs.filterAndPin")}
          </MenuItem>
          <MenuItem
            onClick={() => {
              close();
              openSettings("global-git");
            }}
          >
            {t("historyRefs.globalHistorySettings")}
          </MenuItem>
        </AnchoredPopover>
      )}
    </>
  );
}
