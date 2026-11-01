import assert from "node:assert/strict";
import { _electron as electron, type ElectronApplication } from "playwright";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const fixtureRoot = await mkdtemp(join(tmpdir(), "eda-updates-gate-"));
const config = join(fixtureRoot, "gitconfig");
await writeFile(config, "[user]\nname = Fixture\nemail = fixture@example.test\n");
let app: ElectronApplication | undefined;
try {
  app = await electron.launch({
    args: [
      "dist/main/index.js",
      "--no-sandbox",
      `--user-data-dir=${fixtureRoot}`,
      ...(process.platform === "linux" ? ["--ozone-platform=x11", "--disable-gpu"] : []),
    ],
    env: { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: "1" },
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(15_000);
  await page.getByRole("button", { name: "Get started", exact: true }).waitFor();
  await page.evaluate(async () => {
    const initial = await window.eda.updates.state();
    if (!initial.ok || initial.value.capability !== "development")
      throw new Error("Development updater is not isolated.");
    for (const action of ["check", "download", "install"] as const) {
      if ((await window.eda.updates[action]()).ok)
        throw new Error(`Development update action was allowed: ${action}`);
    }
    const created = await window.eda.identity.create(
      {
        name: "Update fixture",
        gitName: "Fixture",
        gitEmail: "fixture@example.test",
        hue: 45,
        signing: { format: "none", signCommits: false },
        rules: [],
      },
      { syncGlobalGitConfig: false },
    );
    if (!created.ok) throw new Error(created.error.message);
    const active = await window.eda.identity.setActive(created.value.id);
    if (!active.ok) throw new Error(active.error.message);
  });
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "About", exact: true }).click();
  const version = await page.evaluate(() => window.eda.app.version);
  assert.ok(version.displayVersion.startsWith(`${version.version}-`));
  assert.ok(!version.displayVersion.includes("+g"));
  await page.getByText(version.displayVersion, { exact: true }).waitFor();
  await page
    .getByText(
      "Development builds are never replaced. Use an installed build to check for updates.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Check for updates", exact: true }).count(),
    0,
  );
  await page
    .getByRole("checkbox", { name: "Check for updates automatically", exact: true })
    .click();
  await page.waitForFunction(() => {
    const control = document.querySelector<HTMLInputElement>(
      '#settings-about input[type="checkbox"]',
    );
    return control && !control.checked && !control.disabled;
  });
  const setting = await page.evaluate(() =>
    window.eda.settings.resolve("automaticUpdateChecks", {}),
  );
  assert.ok(setting.ok && setting.value.value === false);
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "About", exact: true }).click();
  await page.waitForFunction(() => {
    const control = document.querySelector<HTMLInputElement>(
      '#settings-about input[type="checkbox"]',
    );
    return control && !control.checked && !control.disabled;
  });
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Check for updates automatically", exact: true })
      .isChecked(),
    false,
  );

  await page.getByRole("button", { name: "Components", exact: true }).click();
  const preview = page.locator("#gallery-states");
  await preview.getByRole("button", { name: "Download update", exact: true }).click();
  await preview.getByRole("progressbar", { name: "Update download", exact: true }).waitFor();
  assert.equal(
    await preview
      .getByRole("progressbar", { name: "Update download", exact: true })
      .getAttribute("value"),
    "45",
  );
  await preview.getByRole("button", { name: "Preview completed download", exact: true }).click();
  await preview.getByRole("button", { name: "Restart and install", exact: true }).waitFor();
  await mkdir("screenshots", { recursive: true });
  await preview.locator("div.mb-6").screenshot({ path: resolve("screenshots/updates-ready.png") });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(940, 900));
  await page.evaluate(async () => {
    const result = await window.eda.settings.set(
      "theme",
      { kind: "application" },
      { mode: "dark", light: "eda-light", dark: "eda-dark" },
    );
    if (!result.ok) throw new Error(result.error.message);
  });
  await page.waitForFunction(() => document.documentElement.dataset["appearance"] === "dark");
  assert.equal(
    await preview.evaluate((element) => element.scrollWidth <= element.clientWidth),
    true,
  );
  await preview
    .locator("div.mb-6")
    .screenshot({ path: resolve("screenshots/updates-ready-dark.png") });
  await preview.getByRole("button", { name: "Restart and install", exact: true }).click();
  await preview.getByRole("button", { name: "Restarting Eda...", exact: true }).waitFor();
  const live = await page.evaluate(() => window.eda.updates.state());
  assert.ok(live.ok && live.value.phase === "idle" && live.value.capability === "development");
  assert.deepEqual(errors, []);
  console.log(
    "Update desktop gate passed: source-build protection, version display, persisted preference and verified-download/install previews without a live feed or installer execution.",
  );
} finally {
  await app?.close();
  await rm(fixtureRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
