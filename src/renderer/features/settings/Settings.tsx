import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ViewTransition } from "../../components/layout/ViewTransition";
import { useViewTransition } from "../../components/layout/hooks/useViewTransition";
import { ErrorDialog } from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";
import { usePreferencesStore } from "../../stores/preferences-store";
import { createTextSearch } from "../../utils/search";
import { SETTINGS_SECTIONS, type SettingsSection } from "./settings-sections";
import { SettingsSidebar } from "./SettingsSidebar";
import { SettingsContent } from "./SettingsContent";

export function Settings({
  selected: requestedSection,
  onSelect,
}: {
  selected: SettingsSection;
  onSelect: (section: SettingsSection) => void;
}) {
  const [displayedSection, setDisplayedSection] = useState(requestedSection);

  const developerSettingsEnabled = usePreferencesStore(
    (state) => state.values.developerSettingsEnabled.value,
  );

  const loading = usePreferencesStore((state) => state.loading);

  const debugSection = SETTINGS_SECTIONS.some(
    (section) => section.id === displayedSection && section.group === "debug",
  );

  const selected =
    debugSection && !developerSettingsEnabled
      ? "about"
      : displayedSection === "repository-fetch" ||
          displayedSection === "repository-pull" ||
          displayedSection === "repository-remotes"
        ? "repository-sync"
        : displayedSection;

  const profile = useAppStore((s) => s.activeIdentity);
  const profileId = profile?.id;

  const repository = useAppStore((state) =>
    state.repositories.find((item) => item.id === state.selectedRepositoryId),
  );

  const error = usePreferencesStore((state) => state.error);
  const content = useRef<HTMLDivElement>(null);
  const syncAnchors = useRef<Partial<Record<SettingsSection, HTMLElement>>>({});
  const navigation = useViewTransition();
  const [query, setQuery] = useState("");
  const matchesQuery = createTextSearch(query);

  const groups = {
    global: t("settings.globalSettings"),
    profile: t("settings.profile"),
    repository: repository
      ? t("settings.repositoryGroup", { name: repository.name })
      : t("settings.repository"),
    debug: t("settings.debug"),
  };

  const sections = SETTINGS_SECTIONS.filter(
    (section) => section.group !== "debug" || developerSettingsEnabled,
  ).map((section) => ({ ...section, group: groups[section.group] }));

  const activeSection = sections.find((section) => section.id === selected);

  const matches = sections.filter((section) =>
    matchesQuery(`${section.group} ${section.title} ${section.description} ${section.keywords}`),
  );

  useLayoutEffect(() => {
    if (requestedSection !== displayedSection)
      navigation.transition(() => setDisplayedSection(requestedSection), "section");
  }, [requestedSection, displayedSection, navigation.transition]);

  useEffect(() => {
    if (debugSection && !developerSettingsEnabled && !loading) onSelect("about");
  }, [debugSection, developerSettingsEnabled, loading, onSelect]);

  useEffect(() => {
    content.current?.scrollTo(0, 0);
    if (displayedSection !== selected)
      syncAnchors.current[displayedSection]?.scrollIntoView({ block: "start" });
  }, [selected, displayedSection]);

  const selectSection = (section: SettingsSection) => {
    if (section !== requestedSection) onSelect(section);
    setQuery("");
  };

  return (
    <div className="settings-shell app-canvas flex h-full min-h-0 bg-bg-base">
      <SettingsSidebar
        selected={selected}
        matches={matches}
        query={query}
        onQueryChange={setQuery}
        onSelect={selectSection}
        profile={profile}
      />

      <div ref={content} className="app-surface-content min-w-0 flex-1 overflow-y-auto">
        <ViewTransition
          ref={navigation.ref}
          viewKey={`${profileId}:${repository?.id}`}
          className="mx-auto max-w-[68rem] px-6 py-8 lg:px-10"
        >
          {error && (
            <ErrorDialog onDismiss={() => usePreferencesStore.setState({ error: null })}>
              {errorMessage(error)}
            </ErrorDialog>
          )}

          {activeSection && (
            <section
              key={selected}
              id={`settings-${selected}`}
              aria-labelledby={`heading-${selected}`}
            >
              <header className="mb-6">
                <h1 id={`heading-${selected}`} className="text-xl font-semibold tracking-tight">
                  {activeSection.title}
                </h1>
                <p className="mt-2 text-sm text-text-tertiary">{activeSection.description}</p>
              </header>

              <div className="py-4">
                <SettingsContent
                  section={selected}
                  profile={profile}
                  repositoryId={repository?.id}
                  syncAnchors={syncAnchors}
                />
              </div>
            </section>
          )}
        </ViewTransition>
      </div>
    </div>
  );
}
