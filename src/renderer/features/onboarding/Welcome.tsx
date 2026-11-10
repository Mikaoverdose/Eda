import { t } from "@shared/i18n";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRightIcon as ArrowRight, BranchIcon as GitBranch } from "../../components/ui/icons";
import { CommitMessage } from "../history/CommitMessage";
import { Button, Select } from "../../components/ui/index";
import { motionDuration } from "../../motion";

const sampleCommits = [
  t("onboarding.welcome.sampleCommits.findANewDirection", { prefix: "✨ feat: " }),
  t("onboarding.welcome.sampleCommits.theLittleThings", { prefix: "🐛 fix: " }),
  t("onboarding.welcome.sampleCommits.leaveAUsefulNote", { prefix: "📝 docs: " }),
  t("onboarding.welcome.sampleCommits.makeRoomForIdeas", { prefix: "✨ feat: " }),
  t("onboarding.welcome.sampleCommits.keepItSimple", { prefix: "♻️ refactor: " }),
  t("onboarding.welcome.sampleCommits.smoothTheRoughEdges", { prefix: "🐛 fix: " }),
  t("onboarding.welcome.sampleCommits.addAPersonalTouch", { prefix: "✨ feat: " }),
  t("onboarding.welcome.sampleCommits.aFreshStart", { prefix: "🔧 chore: " }),
  t("onboarding.welcome.sampleCommits.coverTheHappyPath", { prefix: "✅ test: " }),
  t("onboarding.welcome.sampleCommits.giveItSomeSpace", { prefix: "🎨 style: " }),
  t("onboarding.welcome.sampleCommits.bringItAllTogether", { prefix: "✨ feat: " }),
  t("onboarding.welcome.sampleCommits.tellTheNextChapter", { prefix: "📝 docs: " }),
  t("onboarding.welcome.sampleCommits.addTinyPawPrints", { prefix: "🐾 feat: " }),
  t("onboarding.welcome.sampleCommits.politelyAskBugsToLeave", { prefix: "🐛 fix: " }),
  t("onboarding.welcome.sampleCommits.putTheKettleOn", { prefix: "🍵 chore: " }),
  t("onboarding.welcome.sampleCommits.aLittlePocketOfJoy", { prefix: "✨ feat: " }),
  t("onboarding.welcome.sampleCommits.catWalkedOnKeyboard", { prefix: "🐈 fix: " }),
  t("onboarding.welcome.sampleCommits.notesForFutureMe", { prefix: "📝 docs: " }),
  t("onboarding.welcome.sampleCommits.growALittleIdea", { prefix: "🌱 feat: " }),
  t("onboarding.welcome.sampleCommits.sweepUnderTheRepo", { prefix: "🧹 chore: " }),
  t("onboarding.welcome.sampleCommits.yesEvenThatButton", { prefix: "✅ test: " }),
  t("onboarding.welcome.sampleCommits.addABerryNiceTouch", { prefix: "🍓 style: " }),
  t("onboarding.welcome.sampleCommits.oneVerySneakyPixel", { prefix: "🐛 fix: " }),
  t("onboarding.welcome.sampleCommits.emotionalSupportButton", { prefix: "🧸 feat: " }),
  t("onboarding.welcome.sampleCommits.untangleTheNoodles", { prefix: "♻️ refactor: " }),
  t("onboarding.welcome.sampleCommits.tuckThePixelsIn", { prefix: "🌙 style: " }),
  t("onboarding.welcome.sampleCommits.theDuckFiguredItOut", { prefix: "🦆 fix: " }),
  t("onboarding.welcome.sampleCommits.saveRoomForCookies", { prefix: "🍪 feat: " }),
  t("onboarding.welcome.sampleCommits.explainTheWizardry", { prefix: "📝 docs: " }),
  t("onboarding.welcome.sampleCommits.mindTheMergeGap", { prefix: "🚂 chore: " }),
  t("onboarding.welcome.sampleCommits.stopTheInfiniteOops", { prefix: "🐛 fix: " }),
  t("onboarding.welcome.sampleCommits.letTheUiBloom", { prefix: "🌸 style: " }),
  t("onboarding.welcome.sampleCommits.tryTheSillyInputs", { prefix: "✅ test: " }),
  t("onboarding.welcome.sampleCommits.giveTheTurtleWheels", { prefix: "🐢 perf: " }),
  t("onboarding.welcome.sampleCommits.sprinkleResponsibly", { prefix: "✨ feat: " }),
  t("onboarding.welcome.sampleCommits.fewerLooseThreads", { prefix: "🧶 refactor: " }),
  t("onboarding.welcome.sampleCommits.letItBeeClickable", { prefix: "🐝 fix: " }),
  t("onboarding.welcome.sampleCommits.justOneMorePixel", { prefix: "🎨 style: " }),
  t("onboarding.welcome.sampleCommits.rescueTheLostChanges", { prefix: "🛟 fix: " }),
  t("onboarding.welcome.sampleCommits.toastAFreshBuild", { prefix: "🍞 chore: " }),
  t("onboarding.welcome.sampleCommits.aVeryPoliteGreeting", { prefix: "🐧 feat: " }),
  t("onboarding.welcome.sampleCommits.trustButVerifyTheCat", { prefix: "✅ test: " }),
  t("onboarding.welcome.sampleCommits.aNoteFromEda", { prefix: "💌 docs: " }),
  t("onboarding.welcome.sampleCommits.takeTheScenicRoute", { prefix: "🌈 feat: " }),
];

const routeMaps = [
  {
    side: "left",
    main: "M70 -20V170Q70 190 90 210L150 270Q170 290 170 310V720",
    paths: [
      "M250 -20V170Q250 190 230 210L190 250Q170 270 170 310",
      "M-20 340H30Q50 340 70 360L150 440Q170 460 170 490",
      "M170 570Q170 590 190 610L240 660Q260 680 260 720",
    ],
    stops: [
      [250, 80, 0],
      [250, 160, 0],
      [70, 360, 1],
      [120, 410, 1],
      [225, 645, 2],
    ],
    interchanges: [
      [170, 310],
      [170, 490],
      [170, 570],
    ],
  },
  {
    side: "right",
    main: "M260 -20V450Q260 470 240 490L100 630Q80 650 80 670V720",
    paths: [
      "M16 160H190Q210 160 230 180L260 210",
      "M304 340H290Q260 340 260 370",
      "M80 670Q80 650 60 630L20 590Q0 570 0 550V470",
    ],
    stops: [
      [40, 160, 0],
      [140, 160, 0],
      [0, 500, 2],
      [20, 590, 2],
    ],
    interchanges: [
      [260, 210],
      [260, 370],
      [80, 670],
    ],
  },
];

export function WelcomeBranches({
  quiet,
  stage,
  stepCount,
  commitStyle = "emoji",
}: {
  quiet: boolean;
  stage: number;
  stepCount: number;
  commitStyle?: "free" | "plain" | "emoji";
}) {
  const routes = useRef<Array<SVGPathElement | null>>([]);
  const [stations, setStations] = useState<Array<Array<{ x: number; y: number }>>>([]);
  const progress = Math.max(0, Math.min(1, stage / (stepCount + 1)));
  const [displayed, setDisplayed] = useState({ stage, commitStyle });
  const changing = displayed.stage !== stage || displayed.commitStyle !== commitStyle;

  useLayoutEffect(() => {
    if (!changing) return;
    const timeout = window.setTimeout(
      () => setDisplayed({ stage, commitStyle }),
      motionDuration("fade"),
    );
    return () => window.clearTimeout(timeout);
  }, [stage, commitStyle, changing]);

  useLayoutEffect(() => {
    setStations(
      routes.current.map((route) => {
        if (!route) return [];
        const length = route.getTotalLength();
        return Array.from({ length: stepCount }, (_, index) => {
          const point = route.getPointAtLength((length * (index + 1)) / (stepCount + 1));
          return { x: point.x, y: point.y };
        });
      }),
    );
  }, [stepCount]);

  useLayoutEffect(() => {
    const resize = () => {
      for (const route of routes.current) {
        const svg = route?.ownerSVGElement;
        const matrix = svg?.getScreenCTM?.();
        if (svg && matrix?.a && matrix.d) {
          svg.style.setProperty("--node-aspect", String(Math.abs(matrix.d / matrix.a)));
        }
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    routes.current.forEach((route) => {
      if (route?.ownerSVGElement) observer.observe(route.ownerSVGElement);
    });
    return () => observer.disconnect();
  }, []);

  const [messageOffset] = useState(() => Math.floor(Math.random() * sampleCommits.length));
  const messages = sampleCommits.map((message) => {
    if (displayed.commitStyle === "emoji") return message;
    const plain = message.slice(message.indexOf(" ") + 1);
    if (displayed.commitStyle === "plain") return plain;
    const subject = plain.slice(plain.indexOf(": ") + 2);
    return subject.charAt(0).toUpperCase() + subject.slice(1);
  });

  return (
    <div
      className="welcome-branches"
      data-quiet={quiet}
      style={{ "--route-progress": progress } as CSSProperties}
      aria-hidden="true"
    >
      {routeMaps.map((map, sideIndex) => (
        <div key={map.side} className={`welcome-branch welcome-branch-${map.side}`}>
          {/* eslint-disable-next-line no-restricted-syntax -- This SVG is the welcome illustration. */}
          <svg
            viewBox={map.side === "right" ? "-16 0 352 700" : "0 0 320 700"}
            preserveAspectRatio="none"
            fill="none"
            className="size-full"
          >
            <g
              className="welcome-paths"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <path pathLength="1" d={map.main} stroke="currentColor" />
              {map.paths.map((path, index) => (
                <path key={path} pathLength="1" d={path} className={`welcome-line-${index}`} />
              ))}
            </g>
            <path
              ref={(node) => {
                routes.current[sideIndex] = node;
              }}
              className="welcome-route"
              pathLength="1"
              d={map.main}
              stroke="currentColor"
              strokeWidth="3"
            />
            <g className="welcome-nodes" stroke="currentColor" strokeWidth="1.5">
              {map.stops.map(([x, y, route]) => (
                <circle
                  key={`${x}:${y}`}
                  className={`welcome-line-${route}`}
                  cx={x}
                  cy={y}
                  r="3.5"
                />
              ))}
              {map.interchanges
                .filter(
                  ([x, y]) =>
                    !(stations[sideIndex] ?? []).some(
                      (station) => Math.hypot(station.x - x!, station.y - y!) < 18,
                    ),
                )
                .map(([x, y]) => (
                  <circle key={`${x}:${y}`} cx={x} cy={y} r="7" />
                ))}
            </g>
            <g className="welcome-stations" stroke="currentColor" strokeWidth="2">
              {(stations[sideIndex] ?? []).map(({ x, y }, index) => (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="5"
                  data-current={stage === index + 1}
                  data-reached={stage > index}
                />
              ))}
            </g>
          </svg>
          <div className="welcome-commit-layer absolute inset-0" data-changing={changing}>
            {[0, 1].map((index) => (
              <div
                key={`${displayed.stage}:${displayed.commitStyle}:${index}`}
                className="welcome-commit-popup"
                style={
                  {
                    top: `${sideIndex === 0 ? (index === 0 ? 23 : 70) : index === 0 ? 42 : 82}%`,
                    "--popup-delay": `${0.7 + index * 1.9 + sideIndex * 0.45}s`,
                  } as CSSProperties
                }
              >
                <CommitMessage compact>
                  {
                    messages[
                      (messageOffset + displayed.stage * 3 + sideIndex * 2 + index) %
                        messages.length
                    ]!
                  }
                </CommitMessage>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <section
      className="welcome-intro relative z-10 mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center px-8 py-12 text-center"
      aria-labelledby="welcome-title"
    >
      <div className="welcome-symbol mb-10 text-accent-text" aria-hidden="true">
        <GitBranch size={72} strokeWidth={1.25} />
      </div>
      <p className="welcome-eyebrow mb-4 text-sm text-text-secondary">
        {t("onboarding.welcome.aFreshStartANewBranch")}
      </p>
      <h1 id="welcome-title" className="welcome-title text-5xl font-semibold tracking-[-0.055em]">
        {t("onboarding.welcome.helloFromEda")}
      </h1>
      <p className="welcome-description mt-5 max-w-xs text-base leading-relaxed text-text-secondary">
        {t("onboarding.welcome.aLittleSpaceForYourNextBigIdea")}
        <br />
        {t("onboarding.welcome.letSMakeItYours")}
      </p>
      <div className="welcome-description mt-6 w-56">
        <Select
          aria-label={t("onboarding.welcome.language")}
          value="en-US"
          onValueChange={() => {}}
        >
          <option value="en-US">{t("onboarding.welcome.englishUnitedStates")}</option>
        </Select>
      </div>
      <div className="welcome-action mt-6">
        <Button variant="primary" onClick={onStart} className="min-w-40">
          {t("onboarding.welcome.getStarted")}
          <ArrowRight size={16} />
        </Button>
      </div>
    </section>
  );
}

export function WelcomeComplete({ onOpen, onTour }: { onOpen: () => void; onTour: () => void }) {
  return (
    <section
      className="setup-complete relative z-10 mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center px-8 py-12 text-center"
      aria-labelledby="setup-complete-title"
    >
      <GitBranch size={64} strokeWidth={1.5} className="mb-8 text-accent-text" aria-hidden="true" />
      <h1 id="setup-complete-title" className="text-4xl font-semibold tracking-tight">
        {t("onboarding.welcome.welcomeToEda")}
      </h1>
      <p className="mt-4 text-sm text-text-secondary">
        {t("onboarding.welcome.yourSpaceIsReadyMakeSomethingGreat")}
      </p>
      <div className="mt-9">
        <Button autoFocus variant="primary" onClick={onTour}>
          {t("onboarding.welcome.takeATour")}
          <ArrowRight size={16} />
        </Button>
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={onOpen}>
            {t("onboarding.welcome.skipForNow")}
          </Button>
        </div>
      </div>
    </section>
  );
}
