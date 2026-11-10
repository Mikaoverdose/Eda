import { t } from "@shared/i18n";
import type { Identity } from "@shared/identity/identity";
import { cx, ListItemButton, SearchField } from "../../components/ui/index";
import type { SETTINGS_SECTIONS, SettingsSection } from "./settings-sections";

export function SettingsSidebar({
  selected,
  matches,
  query,
  onQueryChange,
  onSelect,
  profile,
}: {
  selected: SettingsSection;
  matches: (Omit<(typeof SETTINGS_SECTIONS)[number], "group"> & { group: string })[];
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (section: SettingsSection) => void;
  profile: Identity | null;
}) {
  return (
    <aside className="settings-sidebar app-surface-chrome flex w-[200px] shrink-0 flex-col border-r border-border-subtle bg-bg-inset px-3 py-4">
      <div className="px-2 pb-3">
        <p className="text-sm font-medium text-text-secondary">{t("common.settings")}</p>

        <div className="mt-3">
          <SearchField
            aria-label={t("settings.searchSettings")}
            placeholder={t("settings.searchPlaceholder")}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onQueryChange("");

              if (event.key === "Enter" && matches[0]) {
                onSelect(matches[0].id);
              }
            }}
          />
        </div>
      </div>

      <nav
        aria-label={t("settings.settingsSections")}
        className="-m-1 min-h-0 flex-1 overflow-y-auto p-1"
      >
        {matches.length === 0 && (
          <p role="status" className="px-2 py-3 text-xs text-text-tertiary">
            {t("settings.noSettingsMatch", { query: query })}
          </p>
        )}

        {matches.map((section, index) => (
          <div key={section.id}>
            {matches[index - 1]?.group !== section.group && (
              <h2
                title={section.group}
                className={cx(
                  "settings-nav-group truncate px-2 pb-2 pt-4 text-xs text-text-tertiary",
                  index > 0 && "mt-3 border-t border-border-subtle",
                )}
              >
                {section.group}
              </h2>
            )}

            <ListItemButton
              onClick={() => onSelect(section.id)}
              aria-label={
                ["global", "preferences", "git", "application", "workspace-application"].includes(
                  section.id,
                )
                  ? `${section.group}: ${section.title}`
                  : undefined
              }
              aria-current={selected === section.id ? "page" : undefined}
              aria-controls={`settings-${section.id}`}
              selected={selected === section.id}
              className="mb-0.5"
            >
              <section.icon size={14} aria-hidden="true" className="text-text-tertiary" />
              <span>{section.title}</span>
            </ListItemButton>
          </div>
        ))}
      </nav>

      {profile && (
        <div className="settings-context mt-4 border-t border-border-subtle px-3 pt-4">
          <p className="text-xs text-text-tertiary">{t("settings.activeProfile")}</p>
          <p className="mt-1 truncate text-sm font-medium">{profile.name}</p>
          <p className="mt-1 truncate text-xs text-text-secondary" title={profile.gitEmail}>
            {profile.gitEmail}
          </p>
        </div>
      )}
    </aside>
  );
}
