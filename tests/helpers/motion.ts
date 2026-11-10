import assert from "node:assert/strict";
import type { Locator, Page } from "playwright";

export async function sampleResize(surface: Locator, change: () => Promise<unknown>) {
  await surface.evaluate(async (element) => {
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );

    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );

    const state = element as HTMLElement & { resizeSamples: number[] };
    state.resizeSamples = [element.getBoundingClientRect().height];
    const started = performance.now();

    const sample = () => {
      state.resizeSamples.push(element.getBoundingClientRect().height);
      if (performance.now() - started < 650) requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  });

  await change();
  await surface.page().waitForTimeout(700);

  return surface.evaluate(
    (element) => (element as HTMLElement & { resizeSamples: number[] }).resizeSamples,
  );
}

export function assertSmoothResize(samples: number[]) {
  const first = samples[0]!;
  const last = samples.at(-1)!;
  assert.ok(Math.abs(first - last) > 4, "Expected a visible size change.");

  assert.ok(
    samples.every(
      (height) => height >= Math.min(first, last) - 1 && height <= Math.max(first, last) + 1,
    ),
    "A resize should stay between its starting and final size.",
  );

  assert.ok(
    samples.filter(
      (height) => height > Math.min(first, last) + 1 && height < Math.max(first, last) - 1,
    ).length >= 3,
    "Expected multiple intermediate sizes instead of a snap.",
  );
}

export async function assertCompositorMotion(page: Page): Promise<void> {
  const audit = await page.evaluate(() => {
    const violations: string[] = [];
    let keyframes = 0;
    let transitions = 0;
    const continuous = new Set(["transform", "translate", "opacity"]);
    const discrete = new Set(["visibility", "content-visibility"]);

    const inspect = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSKeyframesRule) {
          keyframes++;

          for (const frame of rule.cssRules) {
            if (!(frame instanceof CSSKeyframeRule)) continue;

            for (const property of frame.style) {
              if (!continuous.has(property)) violations.push(`${rule.name}: ${property}`);
            }
          }
        } else if (rule instanceof CSSStyleRule) {
          const properties = rule.style.transitionProperty.split(",").map((value) => value.trim());
          const behaviors = rule.style.transitionBehavior.split(",").map((value) => value.trim());

          for (const [index, property] of properties.entries()) {
            if (!property || property === "none") continue;

            transitions++;

            if (continuous.has(property)) continue;

            if (
              property === "block-size" &&
              [
                ".ui-collapse, .ui-disclosure::details-content",
                '.ui-animated-size[data-size-motion="animate"]',
              ].includes(rule.selectorText)
            )
              continue;

            if (
              rule.selectorText === ".welcome-stations circle" &&
              (property === "r" || property === "fill")
            )
              continue;

            if (rule.selectorText === ".welcome-route" && property === "stroke-dashoffset")
              continue;

            if (
              (rule.selectorText === ".ui-spotlight-motion" &&
                ["left", "top", "width", "height"].includes(property)) ||
              (rule.selectorText === ".ui-coachmark-motion" && ["left", "top"].includes(property))
            )
              continue;

            if (discrete.has(property) && behaviors[index % behaviors.length] === "allow-discrete")
              continue;

            violations.push(`${rule.selectorText}: ${property}`);
          }
        }

        if ("cssRules" in rule && !(rule instanceof CSSKeyframesRule))
          inspect((rule as CSSGroupingRule).cssRules);
      }
    };

    for (const sheet of document.styleSheets) inspect(sheet.cssRules);

    return { violations, keyframes, transitions };
  });

  assert.ok(audit.keyframes > 0 && audit.transitions > 0, "Expected the application's motion CSS.");

  assert.deepEqual(
    audit.violations,
    [],
    "Motion must use shared presets; only shared size surfaces, disclosures, tour positioning and decorative SVG routes may interpolate layout or paint.",
  );
}
