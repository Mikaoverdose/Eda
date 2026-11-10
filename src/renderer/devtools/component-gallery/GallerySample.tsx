import { t } from "@shared/i18n";
import { type ReactNode } from "react";

export const COMPONENT_GROUPS = [
  { title: t("settings.componentGallery.actions"), id: "gallery-actions" },
  { title: t("settings.componentGallery.textFields"), id: "gallery-fields" },
  { title: t("settings.componentGallery.choices"), id: "gallery-choices" },
  { title: t("settings.componentGallery.identity"), id: "gallery-identity" },
  { title: t("settings.componentGallery.feedback"), id: "gallery-feedback" },
  { title: t("settings.componentGallery.surfaces"), id: "gallery-surfaces" },
  { title: t("settings.componentGallery.code"), id: "gallery-code" },
  { title: t("settings.componentGallery.diff"), id: "gallery-diff" },
  { title: t("settings.componentGallery.repositoryRows"), id: "gallery-repository" },
  { title: t("settings.componentGallery.panels"), id: "gallery-layout" },
  { title: t("settings.componentGallery.featureControls"), id: "gallery-features" },
  { title: t("settings.componentGallery.states"), id: "gallery-states" },
  { title: t("settings.componentGallery.icons"), id: "gallery-icons" },
  { title: t("settings.componentGallery.inventory"), id: "gallery-inventory" },
] as const;

export const DESCRIPTIONS: Record<string, string> = {
  "gallery-actions": t(
    "settings.componentGallery.clearHierarchyCompactActionsAndResponsivePressStates",
  ),
  "gallery-fields": t(
    "settings.componentGallery.comfortableTextEntryWithConsistentFocusAndValidation",
  ),
  "gallery-choices": t(
    "settings.componentGallery.nativeKeyboardInteractionWithClearSelectionFeedback",
  ),
  "gallery-identity": t(
    "settings.componentGallery.aLittlePersonalitySharedAcrossYourProfileControls",
  ),
  "gallery-feedback": t("settings.componentGallery.readableHierarchyAndContextualFeedback"),
  "gallery-surfaces": t(
    "settings.componentGallery.layeredSurfacesWithGentleEntranceAndFocusManagement",
  ),
  "gallery-code": t(
    "settings.componentGallery.sourceTextPatchesAndCommandOutputInTheSharedCodeSurface",
  ),
  "gallery-diff": t(
    "settings.componentGallery.theRealDiffRendererWithSafeSampleDataAndBothLayouts",
  ),
  "gallery-repository": t(
    "settings.componentGallery.fileRowsCommitHistoryAndCommitMetadataUsedInTheWorkspace",
  ),
  "gallery-layout": t(
    "settings.componentGallery.sharedPanelControlsInNormalExpandedAndCollapsedStates",
  ),
  "gallery-features": t(
    "settings.componentGallery.repositoryWorkflowsAndCredentialCardsUsingLocalSampleData",
  ),
  "gallery-states": t("settings.componentGallery.emptyLoadingErrorSuccessAndInformationalFeedback"),
  "gallery-icons": t("settings.componentGallery.consistentStrokesAndSizingAtInterfaceScale"),
  "gallery-inventory": t(
    "settings.componentGallery.everyComponentSourceFileWithLinksToAvailableLivePreviews",
  ),
};

export function Sample({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="gallery-sample scroll-mt-20 rounded-lg border border-border-default bg-bg-surface"
    >
      <header className="flex items-start gap-3 border-b border-border-subtle px-5 py-4">
        <span className="mono mt-0.5 text-xs text-text-tertiary" aria-hidden="true">
          {String(COMPONENT_GROUPS.findIndex((group) => group.id === id) + 1).padStart(2, "0")}
        </span>

        <div>
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          <p className="mt-1 text-xs text-text-tertiary">{DESCRIPTIONS[id]}</p>
        </div>
      </header>

      <div className="min-w-0 p-5">{children}</div>
    </section>
  );
}

export function PreviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="gallery-preview-row">
      <p className="text-xs font-medium text-text-tertiary">{label}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Name({ children, inline = false }: { children: ReactNode; inline?: boolean }) {
  return (
    <code className={`mono text-xs text-text-tertiary ${inline ? "" : "mt-3 block"}`}>
      {children}
    </code>
  );
}
