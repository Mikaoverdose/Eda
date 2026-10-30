import { t } from "@shared/i18n";
export type TourScene = "empty" | "home" | "repository" | "commit" | "diff";
export interface TourStep {
  id: string;
  target: string;
  title: string;
  description: string;
  scene: TourScene;
  setup?: "reset-changes";
  advance?: "on-complete";
  task?: "open" | "stage" | "commit" | "diff";
}

export const welcomeTour: readonly TourStep[] = [
  {
    id: "topbar",
    target: "titlebar",
    title: t("tutorial.steps.yourWayAroundEda"),
    description: t("tutorial.steps.projectsOnTheLeftSearchSettingsAndProfilesOnTheRight"),
    scene: "empty",
  },
  {
    id: "add",
    target: "repository-actions",
    title: t("tutorial.steps.threeWaysToGetStarted"),
    description: t("tutorial.steps.cloneARemoteProjectCreateANewOneOrAddALocalFolder"),
    scene: "home",
  },
  {
    id: "open",
    target: "repository-open-tour-repo-0",
    title: t("tutorial.steps.openHelloEda"),
    description: t("tutorial.steps.clickHelloEdaToStartPracticing"),
    scene: "home",
    task: "open",
    advance: "on-complete",
  },
  {
    id: "sync",
    target: "repository-overview",
    title: t("tutorial.steps.meetYourWorkspace"),
    description: t("tutorial.steps.branchesLeftHistoryMiddleEditsRightFetchChecks"),
    scene: "repository",
  },
  {
    id: "stage",
    setup: "reset-changes",
    target: "changes",
    title: t("tutorial.steps.chooseWhatGoesIntoACommit"),
    description: t("tutorial.steps.selectFilesThenStageThemOrChooseStageAll"),
    scene: "repository",
    task: "stage",
    advance: "on-complete",
  },
  {
    id: "draft",
    target: "commit-box",
    title: t("tutorial.steps.describeYourChange"),
    description: t("tutorial.steps.addAShortTitleCommitSavesStagedEditsLocallyPushPublishesThem"),
    scene: "repository",
  },
  {
    id: "inspect",
    target: "history",
    title: t("tutorial.steps.lookInsideACommit"),
    description: t("tutorial.steps.eachRowIsACommitSelectOneToSeeItsChangedFiles"),
    scene: "repository",
    task: "commit",
    advance: "on-complete",
  },
  {
    id: "files",
    target: "commit-files",
    title: t("tutorial.steps.pickAChangedFile"),
    description: t("tutorial.steps.selectReadmeMdToSeeWhatChanged"),
    scene: "commit",
    task: "diff",
    advance: "on-complete",
  },
  {
    id: "diff",
    target: "diff",
    title: t("tutorial.steps.readTheChange"),
    description: t("tutorial.steps.greenMeansAddedRedMeansRemovedTrySideBySideViewOrFinishTheTour"),
    scene: "diff",
  },
];
