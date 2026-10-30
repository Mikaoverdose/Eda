import { t } from "@shared/i18n";
import type { ReactNode } from "react";
import { IdentitySwitcher } from "../features/profiles/IdentitySwitcher";
import { Button, SettingsIcon, cx } from "../components/ui/index";
import { ArrowLeft, Search } from "lucide-react";
import { shortcutLabel, type DesktopPlatform } from "../commands/shell-commands";
import { WindowTitlebar } from "./WindowControls";

export function Toolbar({
  onAddIdentity,
  onManageProfiles,
  onOpenSettings,
  onOpenCommands,
  platform,
  settingsOpen,
  tabs,
}: {
  onAddIdentity: () => void;
  onManageProfiles: () => void;
  onOpenSettings: () => void;
  onOpenCommands: () => void;
  platform: DesktopPlatform;
  settingsOpen: boolean;
  tabs?: ReactNode;
}) {
  return (
    <WindowTitlebar>
      {settingsOpen && (
        <Button variant="ghost" size="sm" onClick={onOpenSettings} icon={<ArrowLeft size={14} />}>
          {t("toolbar.backToWorkspace")}
        </Button>
      )}

      <div className="min-w-0 flex-1">{tabs}</div>

      <span aria-hidden="true" className="w-16 shrink-0 self-stretch" />

      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border-default" />

      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenCommands}
        data-tour="commands"
        aria-label={t("toolbar.commandPalette")}
        title={t("toolbar.commandPaletteShortcut", {
          value1: shortcutLabel({ key: "p", shift: true }, platform),
        })}
        icon={<Search size={15} />}
        className="size-8 shrink-0"
      />

      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenSettings}
        data-tour="settings"
        aria-label={t("common.settings")}
        aria-current={settingsOpen ? "page" : undefined}
        title={t("common.settings")}
        icon={<SettingsIcon />}
        className={cx("size-8", settingsOpen && "bg-bg-raised text-text-primary")}
      />

      <IdentitySwitcher onAddIdentity={onAddIdentity} onManageProfiles={onManageProfiles} />
    </WindowTitlebar>
  );
}
