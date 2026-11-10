import { ERROR_CODE } from "@shared/error-codes";
import { AppError } from "@shared/errors";
import { emptySession } from "@shared/identity/profile-session";
import { useCallback } from "react";
import { Toolbar } from "../app/Toolbar";
import { Workspace } from "../app/Workspace";
import { WorkspaceFrame } from "../app/WorkspaceFrame";
import { ModalBehaviorContext } from "../components/ui/overlays/ModalSurface";
import { hasOpenOverlay } from "../components/ui/overlays/overlay-presence";
import { RepositoryTabs } from "../features/repositories/RepositoryTabs";
import { useAppStore } from "../stores/app-store";
import { usePreferencesStore } from "../stores/preferences-store";
import { useRepositoryStore } from "../stores/repository-store";
import { useSessionStore } from "../stores/session-store";
import { TourGuide } from "./TourGuide";
import { commits, createDemo, demoIdentity, demoRepositories } from "./demo";
import { welcomeTour, type TourStep } from "./steps";

const demo = createDemo();
export async function initializeDemo() {
  if (window === window.parent || window.eda)
    throw new AppError(ERROR_CODE.TUTORIAL_ISOLATION_REQUIRED);
  let receiveInitial!: () => void;
  const initialAppearance = new Promise<void>((resolve) => {
    receiveInitial = resolve;
  });
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window.parent || event.data?.type !== "eda:tour-appearance") return;
    document.documentElement.style.cssText = event.data.style;
    const diffMode = demo.setPresentation({
      platform: event.data.platform,
      preferences: event.data.preferences,
    });
    usePreferencesStore.setState({
      values: { ...event.data.preferences, diffMode: diffMode ?? event.data.preferences.diffMode },
    });
    for (const key of Object.keys(document.documentElement.dataset))
      delete document.documentElement.dataset[key];
    for (const [key, value] of Object.entries(event.data.attributes)) {
      if (typeof value === "string") document.documentElement.dataset[key] = value;
    }
    receiveInitial();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.defaultPrevented && !hasOpenOverlay()) finish();
  });
  Object.defineProperty(window, "eda", { value: demo.api, writable: false });
  useAppStore.setState({
    loading: false,
    activeIdentity: demoIdentity,
    identities: [demoIdentity],
    repositories: [],
  });
  useSessionStore.setState({
    snapshot: {
      context: { profileId: demoIdentity.id, windowId: "tour", generation: 1 },
      session: emptySession(),
      drafts: {},
      recovery: null,
    },
  });
  window.parent.postMessage({ type: "eda:tour-ready" }, "*");
  await initialAppearance;
  const image = usePreferencesStore.getState().values.background.value.image;
  if (image) {
    const background = new Image();
    background.src = image;
    await background.decode().catch(() => {});
  }
  await document.fonts.ready;
}
const subscribe = (notify: () => void) => {
  const app = useAppStore.subscribe(notify);
  const repository = useRepositoryStore.subscribe(notify);
  return () => {
    app();
    repository();
  };
};
const presented = () => window.parent.postMessage({ type: "eda:tour-presented" }, "*");
const finish = () => window.parent.postMessage({ type: "eda:tour-finished" }, "*");
const complete = (step: TourStep) => {
  const state = useRepositoryStore.getState();
  switch (step.task) {
    case "open":
      return useAppStore.getState().selectedRepositoryId === demoRepositories[0]!.id;
    case "stage":
      return !!state.status?.changes.some((c) => c.index !== ".");
    case "commit":
      return state.selection?.kind === "commit";
    case "diff":
      return state.contentView === "diff" && !!state.commitFilePath;
    default:
      return true;
  }
};
export function DemoRoot() {
  const prepare = useCallback(async (step: TourStep, previous?: TourStep) => {
    if (step.scene === "empty" || step.scene === "home") {
      useAppStore.getState().selectRepository(null);
      useAppStore.setState({ repositories: step.scene === "empty" ? [] : demoRepositories });
      return;
    }
    useAppStore.setState({ repositories: demoRepositories });
    const id = demoRepositories[0]!.id;
    useAppStore.getState().selectRepository(id);
    await useRepositoryStore.getState().open(id, demoIdentity.id, true);
    if (step.setup === "reset-changes") {
      demo.reset();
      await useRepositoryStore.getState().refresh();
    }
    if (step.scene === "repository") useRepositoryStore.getState().showWorkingTree();
    if (step.scene === "commit" || step.scene === "diff") {
      if (useRepositoryStore.getState().selection?.kind !== "commit")
        await useRepositoryStore.getState().selectCommit(commits[0]!.oid);
      if (step.scene === "diff") await useRepositoryStore.getState().selectCommitFile("README.md");
      else if (previous?.scene === "diff") useRepositoryStore.getState().showHistory();
    }
  }, []);
  const noop = () => {};
  return (
    <ModalBehaviorContext.Provider value={false}>
      <div className="relative flex h-full flex-col">
        <div id="demo-workspace" className="flex min-h-0 flex-1 flex-col">
          <Toolbar
            onAddIdentity={noop}
            onManageProfiles={noop}
            onOpenSettings={noop}
            onOpenCommands={noop}
            platform={demo.api.app.platform}
            settingsOpen={false}
            tabs={<RepositoryTabs onBrowse={() => useAppStore.getState().selectRepository(null)} />}
          />
          <WorkspaceFrame profileId={demoIdentity.id}>
            <Workspace />
          </WorkspaceFrame>
        </div>
        <TourGuide
          steps={welcomeTour}
          prepare={prepare}
          complete={complete}
          subscribe={subscribe}
          onFinish={finish}
          onReady={presented}
        />
      </div>
    </ModalBehaviorContext.Provider>
  );
}
