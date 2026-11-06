import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import {
  FlaskConical,
  FolderGit2,
  GitBranch,
  Info,
  KeyRound,
  Monitor,
  Palette,
  PanelsTopLeft,
  Plug,
  Trash2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ViewTransition } from "../../components/layout/ViewTransition";
import { useViewTransition } from "../../components/layout/hooks/useViewTransition";
import {
  cx,
  ErrorDialog,
  ListItemButton,
  SearchField,
  StateMessage,
} from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";
import { usePreferencesStore } from "../../stores/preferences-store";
import { createTextSearch } from "../../utils/search";
import { CredentialsSettings } from "../credentials/CredentialsSettings";
import { ProfileGitSettings, RepositoryGitSettings } from "../profiles/ProfileGitSettings";
import { ProfileRepositoriesSettings } from "../profiles/ProfileRepositoriesSettings";
import { ProfilesSettings } from "../profiles/ProfilesSettings";
import { ScopedPreferences } from "./ScopedPreferences";
import { AccentSettings } from "./appearance/AccentSettings";
import { AppearanceControls } from "./appearance/AppearanceControls";
import { AboutSettings } from "./application/AboutSettings";
import { ApplicationPreferences } from "./application/ApplicationPreferences";
import { FailureSimulations } from "./debug/FailureSimulations";
import { ResetDataSettings } from "./debug/ResetDataSettings";
import { FetchSettings } from "./git/FetchSettings";
import { GitEngineSettings } from "./git/GitEngineSettings";
import { SshAgentSettings } from "./git/SshAgentSettings";
import { IntegrationsSettings } from "./integrations/IntegrationsSettings";
import { RepositoryPullSettings } from "./repository/RepositoryPullSettings";
import { RepositoryRemotesSettings } from "./repository/RepositoryRemotesSettings";

const ComponentGallery = lazy(() =>
  import("../../devtools/component-gallery/ComponentGallery").then((module) => ({
    default: module.ComponentGallery,
  })),
);

export type SettingsSection =
  | "profiles"
  | "preferences"
  | "repositories"
  | "credentials"
  | "global-git"
  | "global"
  | "application"
  | "about"
  | "workspace-application"
  | "git"
  | "repository-sync"
  | "repository-fetch"
  | "repository-remotes"
  | "repository-pull"
  | "repository-git"
  | "integrations"
  | "debug"
  | "debug-failures"
  | "debug-reset";

const SECTIONS: {
  id: SettingsSection;
  title: string;
  description: string;
  icon: LucideIcon;
  group: "global" | "profile" | "repository" | "debug";
  keywords: string;
}[] = [
  {
    id: "global",
    keywords: t("settings.globalThemeAppearanceDarkLightAccentColorTint"),
    title: t("settings.appearance"),
    description: t("settings.chooseThemesAccentColorInterfaceScaleAndMotion"),
    icon: Palette,
    group: "global",
  },
  {
    id: "profiles",
    keywords: t("settings.nameEmailAuthorIdentityAvatarDuplicateDeletePathRules"),
    title: t("settings.profiles"),
    description: t("settings.manageCommitIdentitiesRepositoryAccessAndSavedSessions"),
    icon: UsersRound,
    group: "global",
  },
  {
    id: "application",
    keywords: t("settings.globalExternalEditorExecutableMergeToolArgumentsGraphics"),
    title: t("settings.application"),
    description: t("settings.defaultToolsForYourProfilesAndApplicationGraphics"),
    icon: Monitor,
    group: "global",
  },
  {
    id: "global-git",
    keywords: t("settings.globalFetchBackgroundIntervalGitSyncAuthorSigning"),
    title: t("settings.git"),
    description: t("settings.configureGitSynchronizationAndTheGitInstallationUsedByEda"),
    icon: GitBranch,
    group: "global",
  },
  {
    id: "about",
    keywords: t("settings.versionBuildCommitHashDirtyMaintainerYuzuZensai"),
    title: t("settings.about"),
    description: t("settings.versionInformationThePeopleBehindEdaAndItsLicense"),
    icon: Info,
    group: "global",
  },
  {
    id: "preferences",
    keywords: t("settings.profileWorkspaceThemeAppearanceDarkLightNordAccent"),
    title: t("settings.appearance"),
    description: t("settings.customizeThemesAccentColorScaleAndMotionForThisProfile"),
    icon: Palette,
    group: "profile",
  },
  {
    id: "workspace-application",
    keywords: t("settings.profileWorkspaceApplicationExternalEditorMergeToolInheritance"),
    title: t("settings.application"),
    description: t("settings.chooseAnEditorAndMergeToolForThisProfileOrFollowGlobalSettings"),
    icon: Monitor,
    group: "profile",
  },
  {
    id: "repositories",
    keywords: t("settings.membershipShareMoveFolderPathRulesProfileRepository"),
    title: t("settings.repositories"),
    description: t("settings.manageTheLocalRepositoryFoldersListedInThisProfile"),
    icon: FolderGit2,
    group: "profile",
  },
  {
    id: "credentials",
    keywords: t("settings.sShgpgSigningKeyPassphraseFingerprintAgentGenerate"),
    title: t("settings.credentialsSigning"),
    description: t("settings.sshKeysAndCommitSigningForTheActiveProfile"),
    icon: KeyRound,
    group: "profile",
  },
  {
    id: "git",
    keywords: t("settings.profileAuthorEmailNameSigningSyncGitconfigScope"),
    title: t("settings.gitConfiguration"),
    description: t("settings.manageThisProfileSGitIdentityGlobalSynchronization"),
    icon: GitBranch,
    group: "profile",
  },
  {
    id: "integrations",
    keywords: t("settings.providerAccountGitHubGitLabBitbucketAzureTokenProfileOffline"),
    title: t("settings.integrations"),
    description: t("settings.connectTheServicesWhereYourTeamWorks"),
    icon: Plug,
    group: "profile",
  },
  {
    id: "repository-sync",
    title: t("settings.sync"),
    description: t("settings.manageRemotesBackgroundFetchAndPullBehaviorForThisRepository"),
    icon: GitBranch,
    group: "repository",
    keywords: t("settings.fetchBackgroundIntervalPruneTagsAutomaticRemotesOrigin"),
  },
  {
    id: "repository-git",
    keywords: t("settings.repositoryCommitLocalFolderCheckoutAuthorEmailName"),
    title: t("settings.commit"),
    description: t("settings.configureCommitIdentityAndSigningForTheSelectedRepository"),
    icon: GitBranch,
    group: "repository",
  },
  {
    id: "debug",
    keywords: t("settings.debugComponentsGalleryDesignSystemControlsButtonsInputs"),
    title: t("settings.components"),
    description: t("settings.previewTheSharedInterfaceComponentsAndTheirInteractionStates"),
    icon: PanelsTopLeft,
    group: "debug",
  },
  {
    id: "debug-failures",
    keywords: t("settings.debugResilienceTestSimulateCrashRuntimeErrorPromise"),
    title: t("settings.resilienceTesting"),
    description: t("settings.triggerErrorsAndCrashesToTestDiagnosticsAndRecovery"),
    icon: FlaskConical,
    group: "debug",
  },
  {
    id: "debug-reset",
    keywords: t("settings.debugResetDeleteClearAllDataRestartOnboardingFactorySettings"),
    title: t("settings.resetAppData"),
    description: t("settings.startFreshWithEda"),
    icon: Trash2,
    group: "debug",
  },
];

export function Settings({
  selected: requestedSection,
  onSelect,
}: {
  selected: SettingsSection;
  onSelect: (section: SettingsSection) => void;
}) {
  const selected =
    requestedSection === "repository-fetch" ||
    requestedSection === "repository-pull" ||
    requestedSection === "repository-remotes"
      ? "repository-sync"
      : requestedSection;
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
  const sections = SECTIONS.map((section) => ({ ...section, group: groups[section.group] }));
  const activeSections = sections.filter((section) => section.id === selected);
  const matches = sections.filter((section) =>
    matchesQuery(`${section.group} ${section.title} ${section.description} ${section.keywords}`),
  );

  useEffect(() => {
    content.current?.scrollTo(0, 0);
    if (requestedSection !== selected)
      syncAnchors.current[requestedSection]?.scrollIntoView({ block: "start" });
  }, [selected, requestedSection]);

  const selectSection = (section: SettingsSection) => {
    if (section !== requestedSection) navigation.transition(() => onSelect(section));
    setQuery("");
  };

  return (
    <div className="settings-shell app-canvas flex h-full min-h-0 bg-bg-base">
      <aside className="settings-sidebar app-surface-chrome flex w-[200px] shrink-0 flex-col border-r border-border-subtle bg-bg-inset px-3 py-4">
        <div className="px-2 pb-3">
          <p className="text-sm font-medium text-text-secondary">{t("common.settings")}</p>
          <div className="mt-3">
            <SearchField
              aria-label={t("settings.searchSettings")}
              placeholder={t("settings.searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("");
                if (event.key === "Enter" && matches[0]) {
                  selectSection(matches[0].id);
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
                onClick={() => selectSection(section.id)}
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
      <div ref={content} className="app-surface-content min-w-0 flex-1 overflow-y-auto">
        <ViewTransition ref={navigation.ref} className="mx-auto max-w-[68rem] px-6 py-8 lg:px-10">
          {error && (
            <ErrorDialog onDismiss={() => usePreferencesStore.setState({ error: null })}>
              {errorMessage(error)}
            </ErrorDialog>
          )}
          {activeSections.map((section) => (
            <section
              key={section.id}
              id={`settings-${section.id}`}
              hidden={selected !== section.id}
              aria-labelledby={`heading-${section.id}`}
            >
              <header className="mb-6">
                <h1 id={`heading-${section.id}`} className="text-xl font-semibold tracking-tight">
                  {section.title}
                </h1>
                <p className="mt-2 text-sm text-text-tertiary">{section.description}</p>
              </header>
              <div className="py-4">
                {section.id === "profiles" && <ProfilesSettings />}
                {section.id === "preferences" &&
                  (profile ? (
                    <div className="space-y-6">
                      <ScopedPreferences owner="profile" section="appearance" />
                      <AccentSettings owner="profile" />
                      <AppearanceControls owner="profile" active={selected === "preferences"} />
                    </div>
                  ) : (
                    <p className="text-sm text-text-secondary">
                      {t("settings.chooseAProfileToEditItsPreferences")}
                    </p>
                  ))}
                {section.id === "global" && (
                  <div className="space-y-6">
                    <ScopedPreferences
                      owner="application"
                      section="appearance"
                      preview={selected === "global"}
                    />
                    <AccentSettings owner="application" preview={selected === "global"} />
                    <AppearanceControls preview={selected === "global"} />
                  </div>
                )}
                {section.id === "global-git" && (
                  <div className="space-y-6">
                    <ScopedPreferences owner="application" section="git" />
                    <GitEngineSettings />
                    <SshAgentSettings />
                    <FetchSettings />
                  </div>
                )}
                {section.id === "application" && <ApplicationPreferences />}
                {section.id === "about" && selected === "about" && <AboutSettings />}
                {section.id === "workspace-application" &&
                  (profile ? (
                    <ApplicationPreferences key={profile.id} owner="profile" />
                  ) : (
                    <p className="text-sm text-text-secondary">
                      {t("settings.chooseAProfileToEditItsApplicationPreferences")}
                    </p>
                  ))}
                {section.id === "git" && (
                  <div className="space-y-6">
                    {profile && <ScopedPreferences owner="profile" section="git" />}
                    <ProfileGitSettings key={profileId ?? "none"} />
                  </div>
                )}
                {section.id === "repository-sync" &&
                  selected === section.id &&
                  (repository && profile ? (
                    <div key={`${profile.id}:${repository.id}`} className="space-y-8">
                      <section
                        id="settings-repository-fetch"
                        ref={(element) => {
                          if (element) syncAnchors.current["repository-fetch"] = element;
                          else delete syncAnchors.current["repository-fetch"];
                        }}
                        className="scroll-mt-8"
                        aria-label={t("settings.fetchSettings")}
                      >
                        <FetchSettings repositoryId={repository.id} />
                      </section>
                      <section
                        id="settings-repository-pull"
                        ref={(element) => {
                          if (element) syncAnchors.current["repository-pull"] = element;
                          else delete syncAnchors.current["repository-pull"];
                        }}
                        className="scroll-mt-8 space-y-4 border-t border-border-subtle pt-6"
                        aria-labelledby="repository-pull-heading"
                      >
                        <h2 id="repository-pull-heading" className="text-sm font-medium">
                          {t("settings.pull")}
                        </h2>
                        <RepositoryPullSettings repositoryId={repository.id} />
                      </section>
                      <section
                        id="settings-repository-remotes"
                        ref={(element) => {
                          if (element) syncAnchors.current["repository-remotes"] = element;
                          else delete syncAnchors.current["repository-remotes"];
                        }}
                        className="scroll-mt-8 space-y-4 border-t border-border-subtle pt-6"
                        aria-labelledby="repository-remotes-heading"
                      >
                        <h2 id="repository-remotes-heading" className="text-sm font-medium">
                          {t("settings.remotes")}
                        </h2>
                        <p className="text-xs text-text-tertiary">
                          {t("settings.manageRemoteNamesAndFetchAndPushUrLs")}
                        </p>
                        <RepositoryRemotesSettings repositoryId={repository.id} />
                      </section>
                    </div>
                  ) : (
                    <p className="text-sm text-text-secondary">
                      {t("settings.chooseARepositoryToEditItsSyncSettings")}
                    </p>
                  ))}
                {section.id === "repository-git" && <RepositoryGitSettings />}
                {section.id === "repositories" && (
                  <ProfileRepositoriesSettings key={profileId ?? "none"} />
                )}
                {section.id === "credentials" && <CredentialsSettings key={profileId ?? "none"} />}
                {section.id === "integrations" &&
                  selected === "integrations" &&
                  (profileId ? (
                    <IntegrationsSettings key={profileId} profileId={profileId} />
                  ) : (
                    <p className="text-sm text-text-secondary">
                      {t("settings.selectAProfileToConnectGitHub")}
                    </p>
                  ))}
                {section.id === "debug" && selected === "debug" && (
                  <Suspense
                    fallback={
                      <StateMessage tone="loading" title={t("settings.loadingComponents")} />
                    }
                  >
                    <ComponentGallery />
                  </Suspense>
                )}
                {section.id === "debug-failures" && selected === "debug-failures" && (
                  <FailureSimulations />
                )}
                {section.id === "debug-reset" && selected === "debug-reset" && (
                  <ResetDataSettings />
                )}
              </div>
            </section>
          ))}
        </ViewTransition>
      </div>
    </div>
  );
}
