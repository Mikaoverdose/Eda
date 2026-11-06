import assert from "node:assert/strict";
import type { Page } from "playwright";

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
              rule.selectorText === ".ui-collapse, .ui-disclosure::details-content"
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
    "Motion must use shared presets; only disclosures, tour positioning and decorative SVG routes may interpolate layout or paint.",
  );
}
