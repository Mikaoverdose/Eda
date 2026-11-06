import { t } from "@shared/i18n";
import { createTextSearch } from "../../utils/search";
import { useId, useRef, useState, type ReactNode } from "react";
import type { AccentColor } from "@shared/preferences/accent";
import type { LucideIcon } from "lucide-react";
import {
  Button,
  ExternalLinkButton,
  Checkbox,
  CheckboxControl,
  Dialog,
  Field,
  HuePicker,
  IconButton,
  ErrorDialog,
  NoticeBanner,
  StatusBanner,
  StatusBannerStack,
  ActionList,
  DefinitionList,
  ComparisonTable,
  RefreshButton,
  AsyncButton,
  Input,
  Radio,
  ReviewActions,
  SearchField,
  SectionLabel,
  Select,
  Textarea,
  Disclosure,
  ListItemButton,
  MenuItem,
  PopoverSurface,
  RadioCard,
  SegmentedControl,
  Slider,
  RangeField,
  TextButton,
  TabTrigger,
  WindowControlButton,
  ProfileButton,
  BranchIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
  DiffIcon,
  FolderIcon,
  HistoryIcon,
  IdentityIcon,
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
  RefreshIcon,
  RestoreIcon,
  SettingsIcon,
  SidebarIcon,
  TagIcon,
  TreeIcon,
  IconDefaults,
  StateMessage,
  Skeleton,
  SkeletonRows,
} from "../../components/ui/index";
import { SpinnerIcon } from "../../components/ui/icons";
import {
  ModalDescription,
  ModalSurface,
  ModalTitle,
} from "../../components/ui/overlays/ModalSurface";
import { ProfileAvatar } from "../../components/ui/display/ProfileAvatar";
import { COMPONENT_EXPORTS, FEATURE_COMPONENTS, UI_COMPONENTS } from "./componentInventory";
import { PREVIEW_ANCHORS } from "./galleryCoverage";
import {
  CodePreview,
  DiffPreview,
  RepositoryRowsPreview,
  LayoutPreview,
  ViewTransitionPreview,
  StatesPreview,
  UpdatesPreview,
  ThemesPreview,
  RebasePreview,
  KeysPreview,
} from "./ComponentPreviews";

const previewRelease = { name: "Eda", version: "0.0.3" };

const ICONS: { name: string; icon: LucideIcon }[] = [
  { name: "BranchIcon", icon: BranchIcon },
  { name: "CheckIcon", icon: CheckIcon },
  { name: "ChevronDownIcon", icon: ChevronDownIcon },
  { name: "ChevronLeftIcon", icon: ChevronLeftIcon },
  { name: "ChevronRightIcon", icon: ChevronRightIcon },
  { name: "ChevronUpIcon", icon: ChevronUpIcon },
  { name: "CloseIcon", icon: CloseIcon },
  { name: "DiffIcon", icon: DiffIcon },
  { name: "FolderIcon", icon: FolderIcon },
  { name: "HistoryIcon", icon: HistoryIcon },
  { name: "IdentityIcon", icon: IdentityIcon },
  { name: "MaximizeIcon", icon: MaximizeIcon },
  { name: "MinusIcon", icon: MinusIcon },
  { name: "PlusIcon", icon: PlusIcon },
  { name: "RefreshIcon", icon: RefreshIcon },
  { name: "RestoreIcon", icon: RestoreIcon },
  { name: "SettingsIcon", icon: SettingsIcon },
  { name: "SidebarIcon", icon: SidebarIcon },
  { name: "SpinnerIcon", icon: SpinnerIcon },
  { name: "TagIcon", icon: TagIcon },
  { name: "TreeIcon", icon: TreeIcon },
];

const BUTTON_VARIANTS = ["primary", "identity", "secondary", "ghost", "quiet", "danger"] as const;

const COMPONENT_GROUPS = [
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

const DESCRIPTIONS: Record<string, string> = {
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

function Sample({ id, title, children }: { id: string; title: string; children: ReactNode }) {
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

function PreviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="gallery-preview-row">
      <p className="text-xs font-medium text-text-tertiary">{label}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Name({ children, inline = false }: { children: ReactNode; inline?: boolean }) {
  return (
    <code className={`mono text-xs text-text-tertiary ${inline ? "" : "mt-3 block"}`}>
      {children}
    </code>
  );
}

function ComponentInventory() {
  const [query, setQuery] = useState("");
  const matchesQuery = createTextSearch(query);
  const groups = [
    { group: t("settings.componentGallery.sharedUi"), files: UI_COMPONENTS },
    ...FEATURE_COMPONENTS,
  ];
  const allFiles = groups.flatMap((group) => [...group.files]);
  const matches = groups
    .map((group) => ({
      ...group,
      files: group.files.filter((file) =>
        matchesQuery(`${file} ${COMPONENT_EXPORTS[file]?.join(" ")}`),
      ),
    }))
    .filter((group) => group.files.length);

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-text-secondary">
        {t("settings.componentGallery.sourceFilesExportedComponentsFilesHaveLiveExamples", {
          length: allFiles.length,
          lengthValue: Object.values(COMPONENT_EXPORTS).flat().length,
          lengthValueValue: allFiles.filter((file) => PREVIEW_ANCHORS[file]).length,
        })}
      </p>
      <SearchField
        size="md"
        aria-label={t("settings.componentGallery.findAComponent")}
        placeholder={t("settings.componentGallery.findAComponentSourceFileOrView")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {!matches.length && (
        <StateMessage
          title={t("settings.componentGallery.noComponentsMatch")}
          description={t("settings.componentGallery.tryAComponentNameSuchAsDiffContentOrCodeBlock")}
        />
      )}
      {matches.map((group) => (
        <Disclosure
          key={`${group.group}:${!!query.trim()}`}
          open={query.trim() ? true : undefined}
          title={
            <>
              {group.group} <span className="text-text-tertiary">({group.files.length})</span>
            </>
          }
          className="rounded-md border border-border-subtle bg-bg-inset px-3 py-3"
          summaryClassName="text-sm font-medium"
        >
          <ul className="mt-3 divide-y divide-border-subtle">
            {group.files.map((file) => (
              <li
                key={file}
                className="flex min-w-0 flex-wrap items-start justify-between gap-2 py-3"
              >
                <div className="min-w-0 flex-1">
                  <code className="break-all text-xs text-text-primary">{file}</code>
                  <p className="mt-1 break-words text-xs text-text-tertiary">
                    {COMPONENT_EXPORTS[file]?.join(", ") ||
                      t("settings.componentGallery.sharedExports")}
                  </p>
                </div>
                {PREVIEW_ANCHORS[file] ? (
                  <a
                    className="inline-flex min-h-6 shrink-0 items-center rounded-sm text-xs text-accent-text underline underline-offset-2"
                    href={`#${PREVIEW_ANCHORS[file]}`}
                  >
                    {t("settings.componentGallery.livePreview")}
                  </a>
                ) : (
                  <span className="py-1 text-xs text-text-tertiary">
                    {t("settings.componentGallery.appContext")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Disclosure>
      ))}
    </div>
  );
}

export function ComponentGallery() {
  const [showStatusNotice, setShowStatusNotice] = useState(true);
  const exampleTabs = useRef(new Map<string, HTMLButtonElement>());
  const modalDescriptionId = useId();
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [choice, setChoice] = useState("first");
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("first");
  const [segment, setSegment] = useState("first");
  const [tab, setTab] = useState("first");
  const [list, setList] = useState("changes");
  const [showErrorExample, setShowErrorExample] = useState(false);
  const [slider, setSlider] = useState(50);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRoot = useRef<HTMLDivElement>(null);
  const [hue, setHue] = useState<AccentColor>(210);
  const [modal, setModal] = useState<"dialog" | "drawer" | "surface" | null>(null);
  const [feedback, setFeedback] = useState(
    t("settings.componentGallery.theseExamplesOnlyChangeThisPage"),
  );

  return (
    <div className="component-gallery space-y-5 pb-12">
      <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
        {t("settings.componentGallery.aLivePlaygroundForEdaSInterfaceExplore")}
      </p>

      <nav
        aria-label={t("settings.componentGallery.componentCategories")}
        className="gallery-nav sticky top-0 z-10 flex min-w-0 gap-1 overflow-x-auto border-b border-border-subtle py-3"
      >
        {COMPONENT_GROUPS.map((group) => (
          <a
            key={group.id}
            href={`#${group.id}`}
            className="ui-interactive shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-raised hover:text-text-primary"
          >
            {group.title}
          </a>
        ))}
      </nav>

      <Sample id="gallery-actions" title={t("settings.componentGallery.actions")}>
        <div className="gallery-preview-rows">
          <PreviewRow label={t("settings.componentGallery.emphasis")}>
            {BUTTON_VARIANTS.map((variant) => (
              <Button
                key={variant}
                variant={variant}
                hue={variant === "identity" ? hue : undefined}
                onClick={() =>
                  setFeedback(
                    t("settings.componentGallery.actionTriggered", {
                      value1: variant.charAt(0).toUpperCase(),
                      variant: variant.slice(1),
                    }),
                  )
                }
              >
                {variant.charAt(0).toUpperCase()}
                {variant.slice(1)}
              </Button>
            ))}
          </PreviewRow>
          <PreviewRow label={t("settings.componentGallery.sizesStates")}>
            <Button
              size="sm"
              onClick={() => setFeedback(t("settings.componentGallery.smallActionTriggered"))}
            >
              {t("settings.componentGallery.small")}
            </Button>
            <Button
              size="md"
              onClick={() => setFeedback(t("settings.componentGallery.mediumActionTriggered"))}
            >
              {t("settings.componentGallery.medium")}
            </Button>
            <Button
              size="lg"
              onClick={() => setFeedback(t("settings.componentGallery.largeActionTriggered"))}
            >
              {t("settings.componentGallery.large")}
            </Button>
            <Button disabled>{t("settings.componentGallery.disabled")}</Button>
            <AsyncButton
              label={t("settings.componentGallery.tryLoading")}
              onAction={() => new Promise((resolve) => setTimeout(() => resolve(true), 1200))}
            >
              {t("settings.componentGallery.tryLoading")}
            </AsyncButton>
            <AsyncButton
              label={t("settings.componentGallery.tryFailure")}
              onAction={async () => false}
            >
              {t("settings.componentGallery.tryFailure")}
            </AsyncButton>
          </PreviewRow>
          <PreviewRow label={t("settings.componentGallery.compactActions")}>
            <ExternalLinkButton
              href="https://eda.kirameki.cafe"
              onClick={(event) => {
                event.preventDefault();
                setFeedback(
                  t("settings.componentGallery.externalLinkPreviewClickedTheBrowserStaysClosed"),
                );
              }}
            >
              {t("settings.componentGallery.externalLink")}
            </ExternalLinkButton>
            <RefreshButton
              label={t("settings.componentGallery.refreshCompactAction")}
              onRefresh={async () => true}
            />
            <IconButton
              size="xs"
              aria-label={t("settings.componentGallery.smallIconAction")}
              title={t("common.add")}
              icon={<PlusIcon size={14} />}
              onClick={() => setFeedback(t("settings.componentGallery.addActionTriggered"))}
            />
            <TextButton
              tone="accent"
              onClick={() => setFeedback(t("settings.componentGallery.textActionTriggered"))}
            >
              {t("settings.componentGallery.viewDetails")}
            </TextButton>
            <ProfileButton
              profileName={t("settings.componentGallery.edaExample")}
              aria-label={t("settings.componentGallery.exampleProfileButton")}
              onClick={() => setFeedback(t("settings.componentGallery.profileActionTriggered"))}
            >
              <ProfileAvatar name="Eda Example" hue={hue} small />
            </ProfileButton>
            <div className="ml-2 flex h-[32px] overflow-hidden rounded-md border border-border-subtle bg-bg-inset">
              <WindowControlButton
                aria-label={t("settings.componentGallery.exampleWindowControl")}
                onClick={() => setFeedback(t("settings.componentGallery.minimizePreviewTriggered"))}
              >
                <MinusIcon size={14} />
              </WindowControlButton>
              <WindowControlButton
                close
                aria-label={t("settings.componentGallery.exampleCloseControl")}
                onClick={() => setFeedback(t("settings.componentGallery.closePreviewTriggered"))}
              >
                <CloseIcon size={14} />
              </WindowControlButton>
            </div>
          </PreviewRow>
          <PreviewRow label={t("settings.componentGallery.listsTabs")}>
            <div className="w-44 space-y-1 rounded-lg border border-border-subtle bg-bg-inset p-1">
              <ListItemButton selected={list === "changes"} onClick={() => setList("changes")}>
                <DiffIcon size={14} />
                {t("settings.componentGallery.changes")}
              </ListItemButton>
              <ListItemButton selected={list === "history"} onClick={() => setList("history")}>
                <HistoryIcon size={14} />
                {t("settings.componentGallery.history")}
              </ListItemButton>
            </div>
            <div className="ml-2">
              <div
                role="tablist"
                aria-label={t("settings.componentGallery.exampleTabs")}
                className="flex gap-1 border-b border-border-subtle"
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

                  event.preventDefault();

                  const next =
                    event.key === "Home"
                      ? "first"
                      : event.key === "End"
                        ? "second"
                        : tab === "first"
                          ? "second"
                          : "first";

                  setTab(next);

                  exampleTabs.current.get(next)?.focus();
                }}
              >
                {["first", "second"].map((value, index) => (
                  <TabTrigger
                    key={value}
                    ref={(element) => {
                      if (element) exampleTabs.current.set(value, element);
                      else exampleTabs.current.delete(value);
                    }}
                    id={`gallery-tab-${value}`}
                    aria-controls={`gallery-panel-${value}`}
                    selected={tab === value}
                    onClick={() => setTab(value)}
                    tabIndex={tab === value ? 0 : -1}
                  >
                    {index === 0
                      ? t("settings.componentGallery.overview")
                      : t("settings.componentGallery.activity")}
                  </TabTrigger>
                ))}
              </div>
              {["first", "second"].map((value) => (
                <p
                  key={value}
                  role="tabpanel"
                  id={`gallery-panel-${value}`}
                  aria-labelledby={`gallery-tab-${value}`}
                  hidden={tab !== value}
                  tabIndex={0}
                  className="px-2 pt-3 text-xs text-text-tertiary"
                >
                  {value === "first"
                    ? t("settings.componentGallery.yourRepositoryAtAGlance")
                    : t("settings.componentGallery.recentRepositoryActivity")}
                </p>
              ))}
            </div>
          </PreviewRow>
        </div>
        <div
          role="status"
          aria-live="polite"
          className="mt-4 flex items-center gap-2 rounded-md border border-border-subtle bg-bg-inset px-3 py-2 text-xs text-text-secondary"
        >
          <CheckIcon size={14} className="shrink-0 text-accent-text" aria-hidden="true" />
          {feedback}
        </div>
        <Name>{t("settings.componentGallery.buttonBaseButtonAsyncButtonRefreshButtonAction")}</Name>
      </Sample>

      <Sample id="gallery-fields" title={t("settings.componentGallery.textFields")}>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Input
              aria-label={t("settings.componentGallery.exampleInput")}
              placeholder={t("settings.componentGallery.repositoryName")}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <Input
              aria-label={t("settings.componentGallery.smallInput")}
              size="sm"
              placeholder={t("settings.componentGallery.compactInput")}
            />
            <Input
              aria-label={t("settings.componentGallery.invalidInput")}
              invalid
              placeholder={t("settings.componentGallery.invalidInput")}
            />
            <Input
              aria-label={t("settings.componentGallery.disabledInput")}
              disabled
              value={t("componentGallery.inputDisabled")}
              readOnly
            />
            <Name>{t("settings.componentGallery.input")}</Name>
          </div>
          <div className="space-y-2">
            <SearchField
              aria-label={t("settings.componentGallery.exampleSearch")}
              size="md"
              placeholder={t("settings.componentGallery.searchRepositories")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Field
              label={t("settings.componentGallery.field")}
              hint={t("settings.componentGallery.labelAndHintAreLinkedToTheInput")}
            >
              {(props) => (
                <Input {...props} placeholder={t("settings.componentGallery.fieldWithInput")} />
              )}
            </Field>
            <Field
              label={t("settings.componentGallery.fieldWithError")}
              error={t("settings.componentGallery.exampleValidationMessage")}
            >
              {(props) => (
                <Input {...props} invalid value={t("componentGallery.needsAttention")} readOnly />
              )}
            </Field>
            <Name>{t("settings.componentGallery.searchFieldField")}</Name>
          </div>
        </div>
      </Sample>

      <Sample id="gallery-choices" title={t("settings.componentGallery.choicesAndTextArea")}>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <label className="block space-y-1.5 text-xs text-text-secondary">
              <span>{t("settings.componentGallery.selection")}</span>
              <Select
                className="w-full"
                aria-label={t("settings.componentGallery.exampleSelect")}
                value={choice}
                onValueChange={setChoice}
              >
                <option value="first">{t("settings.componentGallery.firstOption")}</option>
                <option value="second">{t("settings.componentGallery.secondOption")}</option>
                <option value="unavailable" disabled>
                  {t("settings.componentGallery.unavailableOption")}
                </option>
              </Select>
            </label>
            <Field
              label={t("settings.componentGallery.selectionWithError")}
              error={t("settings.componentGallery.chooseAnAvailableOption")}
            >
              {(props) => (
                <Select
                  {...props}
                  invalid
                  className="w-full"
                  value=""
                  onValueChange={() => undefined}
                >
                  <option value="" disabled>
                    {t("settings.componentGallery.chooseAnOption")}
                  </option>
                  <option value="available">
                    {t("settings.componentGallery.availableOption")}
                  </option>
                </Select>
              )}
            </Field>
            <Select
              aria-label={t("settings.componentGallery.disabledSelect")}
              disabled
              className="w-full"
              value="managed"
              onValueChange={() => undefined}
            >
              <option value="managed">{t("settings.componentGallery.managedSelection")}</option>
            </Select>
            <label className="block space-y-1.5 text-xs text-text-secondary">
              <span>{t("settings.componentGallery.notes")}</span>
              <Textarea
                aria-label={t("settings.componentGallery.exampleTextArea")}
                rows={3}
                placeholder={t("settings.componentGallery.textarea")}
              />
            </label>
            <Field
              label={t("settings.componentGallery.notesWithError")}
              error={t("settings.componentGallery.addADescriptionBeforeContinuing")}
            >
              {(props) => (
                <Textarea
                  {...props}
                  invalid
                  rows={2}
                  placeholder={t("settings.componentGallery.requiredDescription")}
                />
              )}
            </Field>
            <label className="block space-y-2 text-xs text-text-secondary">
              <span>{t("settings.componentGallery.range", { slider: slider })}</span>
              <Slider
                aria-label={t("settings.componentGallery.exampleSlider")}
                min={0}
                max={100}
                value={slider}
                onChange={(event) => setSlider(Number(event.target.value))}
                className="block w-full"
              />
            </label>
            <div className="space-y-1 text-xs text-text-secondary">
              <p>{t("settings.componentGallery.diffLayout")}</p>
              <SegmentedControl
                label={t("settings.componentGallery.exampleSegment")}
                value={segment}
                options={[
                  { value: "first", label: t("settings.componentGallery.unified") },
                  { value: "second", label: t("settings.componentGallery.sideBySide") },
                ]}
                onChange={setSegment}
              />
            </div>
            <RangeField
              label={t("settings.componentGallery.imageStrength")}
              value={slider}
              onCommit={setSlider}
            />
            <Name>
              {t("settings.componentGallery.selectTextareaSliderRangeFieldSegmentedControl")}
            </Name>
          </div>
          <div className="space-y-3">
            <Checkbox
              className="w-full"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            >
              {t("settings.componentGallery.fetchInTheBackground")}
            </Checkbox>
            <Checkbox className="w-full" disabled checked readOnly>
              {t("settings.componentGallery.managedByYourWorkspace")}
            </Checkbox>
            <label className="flex items-center gap-2 text-sm">
              <CheckboxControl
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
              />
              {t("settings.componentGallery.checkboxControl")}
            </label>
            <div
              role="radiogroup"
              aria-label={t("settings.componentGallery.exampleRadioGroup")}
              className="flex flex-wrap gap-4 text-sm"
            >
              {["first", "second"].map((value) => (
                <label key={value} className="flex items-center gap-2">
                  <Radio
                    name="gallery-radio"
                    checked={radio === value}
                    onChange={() => setRadio(value)}
                  />
                  {value}
                </label>
              ))}
            </div>
            <div
              role="radiogroup"
              aria-label={t("settings.componentGallery.radioCardExample")}
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {["first", "second"].map((value) => (
                <RadioCard
                  key={value}
                  name="gallery-card"
                  value={value}
                  checked={radio === value}
                  onChange={setRadio}
                >
                  <span
                    aria-hidden="true"
                    className="radio-control"
                    data-checked={radio === value}
                  />
                  <span className="text-sm">
                    {value === "first"
                      ? t("settings.componentGallery.comfortable")
                      : t("settings.componentGallery.compact")}
                  </span>
                </RadioCard>
              ))}
              <RadioCard
                name="gallery-card"
                value="disabled"
                checked={false}
                disabled
                onChange={setRadio}
              >
                <span className="text-sm">{t("settings.componentGallery.unavailable")}</span>
              </RadioCard>
            </div>
            <Name>{t("settings.componentGallery.checkboxCheckboxControlRadioRadioCard")}</Name>
          </div>
        </div>
      </Sample>

      <Sample id="gallery-identity" title={t("settings.componentGallery.identityAndColor")}>
        <div className="flex flex-wrap items-center gap-5">
          <ProfileAvatar name="Eda Example" hue={hue} />
          <ProfileAvatar name="Eda Example" hue={hue} small />
          <HuePicker value={hue} onChange={setHue} />
        </div>
        <Name>{t("settings.componentGallery.profileAvatarHuePicker")}</Name>
        <div className="mt-6">
          <ThemesPreview />
          <Name>
            {t(
              "settings.componentGallery.themePreferencesThemeGridRadioCardChangesStayInThisPreview",
            )}
          </Name>
        </div>
      </Sample>

      <Sample id="gallery-feedback" title={t("settings.componentGallery.feedbackAndHeadings")}>
        <div className="space-y-3">
          <SectionLabel
            trailing={<Name inline>{t("settings.componentGallery.trailingContent")}</Name>}
          >
            {t("settings.componentGallery.sectionLabel")}
          </SectionLabel>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-text-secondary">
              {t("settings.componentGallery.quickRefresh")}
            </span>
            <RefreshButton
              label={t("settings.componentGallery.quickRefreshPreview")}
              onRefresh={async () => true}
            />
            <span className="text-xs text-text-secondary">
              {t("settings.componentGallery.slowRefresh")}
            </span>
            <RefreshButton
              label={t("settings.componentGallery.slowRefreshPreview")}
              onRefresh={() => new Promise((resolve) => setTimeout(() => resolve(true), 1200))}
            />
            <span className="text-xs text-text-secondary">
              {t("settings.componentGallery.failedRefresh")}
            </span>
            <RefreshButton
              label={t("settings.componentGallery.failedRefreshPreview")}
              onRefresh={async () => false}
            />
          </div>
          <Button onClick={() => setShowErrorExample(true)}>
            {t("settings.componentGallery.showErrorDialog")}
          </Button>
          {showErrorExample && (
            <ErrorDialog onDismiss={() => setShowErrorExample(false)}>
              {t("settings.componentGallery.theActionCouldNotBeCompletedYourChangesArePreserved")}
            </ErrorDialog>
          )}
          <ActionList
            items={[
              {
                id: "example",
                title: t("settings.componentGallery.developerTools"),
                description: t("settings.componentGallery.inspectRuntimeErrorsInTheConsole"),
                actions: (
                  <Button
                    onClick={() =>
                      setFeedback(t("settings.componentGallery.developerToolsActionSelected"))
                    }
                  >
                    {t("settings.componentGallery.openTools")}
                  </Button>
                ),
              },
            ]}
          />
          <DefinitionList
            items={[
              {
                label: t("settings.componentGallery.author"),
                value: t("componentGallery.alexChen"),
              },
              {
                label: t("settings.componentGallery.gitVersion"),
                value: "2.44",
                description: t("settings.componentGallery.bundledInstallation"),
              },
            ]}
          />
          <StatusBannerStack>
            <StatusBanner
              label={t("globalGitWarning.globalGitConfigurationWarning")}
              tone="warning"
            >
              {t("globalGitWarning.globalGitSettingsDifferFrom", {
                name: t("componentGallery.alexChen"),
              })}
            </StatusBanner>

            {showStatusNotice && (
              <StatusBanner
                label={t("appUpdateNotice.updateNotification")}
                onDismiss={() => setShowStatusNotice(false)}
                action={
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => setFeedback(t("appUpdateNotice.viewUpdate"))}
                  >
                    {t("appUpdateNotice.viewUpdate")}
                  </Button>
                }
              >
                {t("appUpdateNotice.isAvailable", {
                  value1: `${previewRelease.name} ${previewRelease.version}`,
                })}
              </StatusBanner>
            )}
          </StatusBannerStack>

          {!showStatusNotice && (
            <Button onClick={() => setShowStatusNotice(true)}>
              {t("settings.stateSimulations.resetPreview")}
            </Button>
          )}

          <NoticeBanner
            tone="warning"
            action={
              <Button
                size="sm"
                onClick={() =>
                  setFeedback(t("settings.componentGallery.globalAppearanceSelectedInPreview"))
                }
              >
                {t("settings.componentGallery.useGlobalAppearance")}
              </Button>
            }
          >
            {t("settings.componentGallery.previewingGlobalAppearanceYourWorkspaceHasItsOwnTheme")}
          </NoticeBanner>
          <NoticeBanner>{t("settings.componentGallery.yourPreferencesHaveBeenSaved")}</NoticeBanner>
          <NoticeBanner tone="error">
            {t("settings.componentGallery.couldNotSaveYourPreferencesTryAgain")}
          </NoticeBanner>
          <ComparisonTable
            label={t("settings.componentGallery.exampleSettingsChanges")}
            fieldLabel={t("settings.componentGallery.setting")}
            beforeLabel={t("settings.componentGallery.current")}
            afterLabel={t("settings.componentGallery.proposed")}
            rows={[
              {
                id: "email",
                label: t("common.email"),
                before: "alex@personal.example",
                after: "alex@work.example",
              },
            ]}
          />
          <p className="rounded-md border border-accent-border bg-accent-muted px-3 py-2 text-sm text-accent-text">
            {t("settings.componentGallery.yourPreferencesHaveBeenSaved")}
          </p>
          <div className="flex flex-wrap gap-2">
            <ReviewActions
              busy={false}
              onClose={() => setFeedback(t("settings.componentGallery.reviewActionsCancel"))}
              onReview={() => setFeedback(t("settings.componentGallery.reviewActionsReview"))}
              onConfirm={() => setFeedback(t("settings.componentGallery.reviewActionsConfirm"))}
              confirmLabel={t("settings.componentGallery.confirm")}
              confirmDisabled={false}
            />
          </div>
          <Name>
            {t("settings.componentGallery.actionListSectionLabelErrorDialogDefinitionList")}
          </Name>
        </div>
      </Sample>

      <Sample id="gallery-surfaces" title={t("settings.componentGallery.surfaces")}>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setModal("dialog")}>
            {t("settings.componentGallery.openDialog")}
          </Button>
          <Button onClick={() => setModal("drawer")}>
            {t("settings.componentGallery.openRightDialog")}
          </Button>
          <Button onClick={() => setModal("surface")}>
            {t("settings.componentGallery.openModalSurface")}
          </Button>
          <div ref={menuRoot} className="relative">
            <Button
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {t("settings.componentGallery.openMenu")}
            </Button>
            {menuOpen && (
              <PopoverSurface
                role="menu"
                aria-label={t("settings.componentGallery.exampleMenu")}
                onClose={() => setMenuOpen(false)}
                interactionRef={menuRoot}
                className="absolute left-0 top-full mt-2 w-52 p-1.5"
              >
                <MenuItem
                  onClick={() => {
                    setFeedback(t("settings.componentGallery.menuItemClicked"));
                    setMenuOpen(false);
                  }}
                >
                  <RefreshIcon size={14} />
                  {t("settings.componentGallery.refreshPreview")}
                </MenuItem>
                <MenuItem disabled>
                  <FolderIcon size={14} />
                  {t("settings.componentGallery.unavailableAction")}
                </MenuItem>
              </PopoverSurface>
            )}
          </div>
        </div>
        <Disclosure
          title={t("settings.componentGallery.disclosureExample")}
          className="mt-3 text-xs"
        >
          <p className="mt-2">
            {t("settings.componentGallery.sharedDisclosureStylingAndFocusState")}
          </p>
        </Disclosure>
        <Name>
          {t("settings.componentGallery.dialogModalSurfaceModalTitleModalDescriptionPopover")}
        </Name>
      </Sample>

      <Sample id="gallery-code" title={t("settings.componentGallery.codeBlocksAndOutput")}>
        <CodePreview />
        <Name>{t("settings.componentGallery.codeBlockCopyButton")}</Name>
      </Sample>
      <Sample id="gallery-diff" title={t("settings.componentGallery.diffViewer")}>
        <DiffPreview />
        <Name>
          {t(
            "settings.componentGallery.diffContentDiffSummaryRowUnifiedDiffRowDiffCellVirtualRows",
          )}
        </Name>
      </Sample>
      <Sample
        id="gallery-repository"
        title={t("settings.componentGallery.repositoryRowsAndMetadata")}
      >
        <RepositoryRowsPreview />
        <Name>{t("settings.componentGallery.directoryRowChangeRowCommitRowCommitDetails")}</Name>
      </Sample>
      <Sample id="gallery-layout" title={t("settings.componentGallery.panelControls")}>
        <LayoutPreview />
        <Name>
          {t("settings.componentGallery.splitCollapsiblePanelPanelControlsCollapsedRail")}
        </Name>
        <ViewTransitionPreview />
        <Name>{t("settings.componentGallery.viewTransitionLayoutTransitionRetainedView")}</Name>
      </Sample>
      <Sample id="gallery-features" title={t("settings.componentGallery.featureControls")}>
        <div className="space-y-6 text-sm">
          <div>
            <KeysPreview />
            <Name>{t("settings.componentGallery.sshKeyListSampleKeysLocalAssignment")}</Name>
          </div>
          <div className="border-t border-border-subtle pt-6">
            <RebasePreview />
            <Name>
              {t("settings.componentGallery.rebasePlanEditorSampleCommitsLocalEditsOnly")}
            </Name>
          </div>
        </div>
      </Sample>

      <Sample id="gallery-states" title={t("settings.componentGallery.contentStates")}>
        <div className="mb-6 space-y-3 border-b border-border-subtle pb-6">
          <h3 className="text-sm font-medium">
            {t("settings.componentGallery.applicationUpdates")}
          </h3>
          <UpdatesPreview />
        </div>
        <StatesPreview />
        <Name>{t("settings.componentGallery.stateMessage")}</Name>
        <div
          role="status"
          aria-label={t("settings.componentGallery.loadingExample")}
          className="mt-4 max-w-sm rounded border border-border-subtle p-3"
        >
          <Skeleton className="h-5 w-28" />
          <SkeletonRows rows={3} />
        </div>
        <Name>{t("settings.componentGallery.skeletonSkeletonRows")}</Name>
      </Sample>

      <Sample id="gallery-icons" title={t("settings.componentGallery.icons")}>
        <IconDefaults>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ICONS.map(({ name, icon: Icon }) => (
              <div
                key={name}
                className="gallery-icon flex min-w-0 items-center gap-2 rounded-md border border-border-subtle bg-bg-inset px-3 py-3 text-xs text-text-secondary"
              >
                <Icon aria-hidden="true" />
                <span className="min-w-0 truncate">{name}</span>
              </div>
            ))}
          </div>
        </IconDefaults>
        <Name>{t("settings.componentGallery.iconDefaultsIconsTsx")}</Name>
      </Sample>

      <Sample
        id="gallery-inventory"
        title={t("settings.componentGallery.componentInventoryAndCoverage")}
      >
        <ComponentInventory />
      </Sample>

      {modal === "dialog" && (
        <Dialog
          title={t("settings.componentGallery.dialogExample")}
          description={t("settings.componentGallery.aCenteredModalWithATitleAndDescription")}
          onClose={() => setModal(null)}
          footer={<Button onClick={() => setModal(null)}>{t("common.close")}</Button>}
        >
          <p className="text-sm">
            {t("settings.componentGallery.focusIsContainedHereUntilTheDialogCloses")}
          </p>
        </Dialog>
      )}
      {modal === "drawer" && (
        <Dialog
          placement="right"
          title={t("settings.componentGallery.rightDialogExample")}
          onClose={() => setModal(null)}
          footer={<Button onClick={() => setModal(null)}>{t("common.close")}</Button>}
        >
          <p className="text-sm">
            {t("settings.componentGallery.theSameDialogComponentSupportsARightSidePlacement")}
          </p>
        </Dialog>
      )}
      {modal === "surface" && (
        <ModalSurface
          placement="top"
          onClose={() => setModal(null)}
          descriptionId={modalDescriptionId}
          className="w-[calc(100vw-2rem)] max-w-lg rounded-lg border border-border-default p-6"
        >
          <ModalTitle className="text-lg font-semibold">
            {t("settings.componentGallery.modalSurfaceExample")}
          </ModalTitle>
          <ModalDescription id={modalDescriptionId} className="mt-2 text-sm text-text-secondary">
            {t("settings.componentGallery.aLowerLevelSurfaceUsedByTheRepositoryPicker")}
          </ModalDescription>
          <Button className="mt-4" onClick={() => setModal(null)}>
            {t("common.close")}
          </Button>
        </ModalSurface>
      )}
    </div>
  );
}
