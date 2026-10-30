import { t } from "@shared/i18n";
import { createTextSearch } from "../utils/search";
import { useState } from "react";
import { SHELL_COMMANDS, shortcutLabel, type DesktopPlatform } from "../commands/shell-commands";
import { Dialog, SearchField } from "../components/ui/index";

const LOCAL_SHORTCUTS = [
  {
    title: t("shortcutHelp.navigateCommandsOrRepositories"),
    keys: t("shortcutHelp.upDownEnter"),
    group: t("shortcutHelp.searchPicker"),
  },
  {
    title: t("shortcutHelp.openFirstMatchingSettingsSection"),
    keys: t("shortcutHelp.enter"),
    group: t("shortcutHelp.settingsSearch"),
  },
  {
    title: t("shortcutHelp.clearSettingsSearch"),
    keys: t("shortcutHelp.escape"),
    group: t("shortcutHelp.settingsSearch"),
  },
  {
    title: t("shortcutHelp.navigateRepositoryTabs"),
    keys: t("shortcutHelp.leftRightHomeEnd"),
    group: t("shortcutHelp.focusedTab"),
  },
  {
    title: t("shortcutHelp.reorderRepositoryTab"),
    keys: t("shortcutHelp.altShiftLeftRight"),
    group: t("shortcutHelp.focusedTab"),
  },
  {
    title: t("shortcutHelp.closeFocusedRepositoryTab"),
    keys: t("common.delete"),
    group: t("shortcutHelp.focusedTab"),
  },
  {
    title: t("shortcutHelp.selectColorTheme"),
    keys: t("shortcutHelp.arrowKeysHomeEnd"),
    group: t("shortcutHelp.themePicker"),
  },
  {
    title: t("shortcutHelp.resizePaneDivider"),
    keys: t("shortcutHelp.arrowKeys"),
    group: t("shortcutHelp.focusedDivider"),
  },
  {
    title: t("shortcutHelp.closeDialogOrMenu"),
    keys: t("shortcutHelp.escape"),
    group: t("shortcutHelp.dialogsAndMenus"),
  },
  {
    title: t("shortcutHelp.moveFocus"),
    keys: t("shortcutHelp.tabShiftTab"),
    group: t("shortcutHelp.dialogsAndControls"),
  },
];

export function ShortcutHelp({
  platform,
  onClose,
}: {
  platform: DesktopPlatform;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const rows = [
    {
      title: t("shortcutHelp.submitCommit"),
      keys: shortcutLabel({ key: "Enter" }, platform),
      group: t("shortcutHelp.commitMessageRequiresAValidMessageAndStagedChanges"),
    },
    ...SHELL_COMMANDS.flatMap((command) =>
      command.shortcut
        ? [
            {
              title: command.title,
              keys: shortcutLabel(command.shortcut, platform),
              group: command.group,
            },
          ]
        : [],
    ),
    ...LOCAL_SHORTCUTS,
  ];

  const matchesQuery = createTextSearch(query);
  const matches = rows.filter((row) => matchesQuery(`${row.title} ${row.keys} ${row.group}`));

  return (
    <Dialog
      title={t("shortcutHelp.keyboardShortcuts")}
      description={t("shortcutHelp.shortcutsFollowTheCurrentProfileAndRepositoryText")}
      onClose={onClose}
    >
      <SearchField
        size="md"
        aria-label={t("shortcutHelp.searchShortcuts")}
        placeholder={t("shortcutHelp.searchActionsOrKeys")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="mt-3 max-h-[min(20rem,40vh)] overflow-y-auto">
        {matches.map((row) => (
          <div
            key={row.title}
            className="flex items-center justify-between gap-4 border-b border-border-subtle py-3"
          >
            <div>
              <p className="text-sm">{row.title}</p>
              <p className="mt-1 text-xs text-text-tertiary">{row.group}</p>
            </div>
            <kbd className="max-w-44 text-right text-xs text-text-secondary">{row.keys}</kbd>
          </div>
        ))}
      </div>
      {matches.length === 0 && (
        <p role="status" className="py-4 text-sm text-text-tertiary">
          {t("shortcutHelp.noShortcutsMatch", { query: query })}
        </p>
      )}
    </Dialog>
  );
}
