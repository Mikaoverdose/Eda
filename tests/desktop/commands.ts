import assert from "node:assert/strict";
import { _electron as electron, type ElectronApplication } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = await mkdtemp(join(tmpdir(), "eda-commands-gate-"));
const repository = join(root, "commands-repo");
const config = join(root, "gitconfig");

await mkdir(repository);
await writeFile(
  config,
  "[user]\nname = Fixture\nemail = fixture@example.com\n[commit]\ngpgsign = false\n",
);

const env = {
  ...process.env,
  HOME: root,
  USERPROFILE: root,
  GIT_CONFIG_GLOBAL: config,
  GIT_CONFIG_SYSTEM: process.platform === "win32" ? "NUL" : "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

execFileSync("git", ["init", "-b", "main", repository], { env, stdio: "pipe" });
await writeFile(join(repository, "file.txt"), "fixture\n");

let app: ElectronApplication | undefined;
const errors: string[] = [];
const modifier = process.platform === "darwin" ? "Meta" : "Control";

try {
  app = await electron.launch({ args: ["dist/main/index.js", `--user-data-dir=${root}`], env });

  const page = await app.firstWindow();

  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await page.getByRole("textbox", { name: /^Profile name/ }).fill("Work");
  await page.getByRole("textbox", { name: /^Git author name/ }).fill("Eda");
  await page.getByRole("textbox", { name: /^Git email/ }).fill("work@example.com");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("heading", { name: "Make Eda yours", exact: true }).waitFor();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Start using Eda", exact: true }).click();
  await page.getByRole("heading", { name: "Welcome to Eda.", exact: true }).waitFor();
  await page.getByRole("button", { name: "Open workspace", exact: true }).click();
  await page.getByRole("button", { name: /Active profile: Work/ }).waitFor();

  const palette = page.getByRole("dialog", { name: "Command palette", exact: true });
  const search = palette.getByRole("combobox", { name: "Search commands" });

  await page.getByRole("button", { name: "Command palette", exact: true }).click();
  await search.fill("refresh repository");

  const refresh = palette.getByRole("option", { name: /Refresh repository/ });

  assert.equal(await refresh.getAttribute("aria-disabled"), "true");
  assert.match(await refresh.innerText(), /Select a repository first/);

  await page.keyboard.press("Tab");
  assert.equal(await search.evaluate((input) => document.activeElement === input), true);

  await page.keyboard.press("Shift+Tab");
  assert.equal(await search.evaluate((input) => document.activeElement === input), true);

  await page.keyboard.press("Enter");
  assert.equal(await palette.isVisible(), true);

  await search.fill("no-such-command");
  await palette.getByRole("status").waitFor();
  await page.keyboard.press("Escape");
  await palette.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "Command palette", exact: true })
      .evaluate((button) => document.activeElement === button),
    true,
  );

  await page.keyboard.press(`${modifier}+Shift+p`);
  await search.fill("manage profiles");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Profiles", exact: true, level: 1 }).waitFor();
  await page.keyboard.press(`${modifier}+/`);

  const help = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });

  await help.getByRole("searchbox", { name: "Search shortcuts" }).fill("reopen");
  assert.match(
    await help.innerText(),
    new RegExp(`${process.platform === "darwin" ? "Cmd" : "Ctrl"}\\+Shift\\+T`),
  );

  await page.keyboard.press(`${modifier}+p`);
  assert.equal(await page.getByRole("dialog").count(), 1);

  await page.keyboard.press("Escape");
  await page.keyboard.press(`${modifier}+,`);

  assert.equal(
    (await page.evaluate((path) => window.eda.repository.open(path), repository)).ok,
    true,
  );

  await page.keyboard.press(`${modifier}+p`);
  await page
    .getByRole("dialog", { name: "Open a repository", exact: true })
    .getByRole("button", { name: /^commands-repo / })
    .click();

  const draft = page.getByRole("textbox", { name: "Commit title" });

  await draft.fill("Keep this draft");

  const nativeKeys = await draft.evaluate((input, platform) => {
    return ["z", "y", "x", "c", "v"].map((key) => {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ctrlKey: platform !== "darwin",
        metaKey: platform === "darwin",
      });

      input.dispatchEvent(event);

      return event.defaultPrevented;
    });
  }, process.platform);

  assert.deepEqual(nativeKeys, [false, false, false, false, false]);

  await page.keyboard.press(`${modifier}+Shift+p`);
  await search.fill("refresh repository");
  assert.equal(await refresh.getAttribute("aria-disabled"), "false");

  await page.keyboard.press("Enter");
  await palette.waitFor({ state: "hidden" });
  await draft.waitFor();
  assert.equal(await draft.inputValue(), "Keep this draft");

  await page.keyboard.press(`${modifier}+Shift+p`);
  await search.fill("diff focus");

  const diffFocus = palette.getByRole("option", { name: /^Toggle diff focus\b/, disabled: false });

  await diffFocus.waitFor();
  await search.press("Enter");
  await palette.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Restore diff", exact: true }).waitFor();
  await page.keyboard.press(`${modifier}+Shift+p`);
  await search.fill("diff focus");
  await diffFocus.waitFor();
  await search.press("Enter");
  await palette.waitFor({ state: "hidden" });
  await draft.waitFor();

  const other = await page.evaluate(async () =>
    window.eda.identity.create({
      name: "Home",
      gitName: "Eda",
      gitEmail: "home@example.com",
      hue: 270,
      signing: { format: "none", signCommits: false },
      rules: [],
    }),
  );

  assert.equal(other.ok, true);

  await page.keyboard.press(`${modifier}+Shift+p`);
  await search.fill("close repository");
  assert.equal(
    (await page.evaluate((id) => window.eda.identity.setActive(id), other.value.id)).ok,
    true,
  );

  await palette.getByRole("alert").filter({ hasText: "profile or repository changed" }).waitFor();
  assert.equal(await palette.getByRole("option").first().getAttribute("aria-disabled"), "true");

  await page.keyboard.press("Enter");
  assert.equal(await palette.isVisible(), true);

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Active profile: Home/ }).waitFor();
  assert.equal(await page.getByRole("tab").count(), 0);
  assert.equal(errors.length, 0, errors.join("\n"));

  await page.keyboard.press(`${modifier}+Shift+p`);
  await page.setViewportSize({ width: 940, height: 600 });
  await search.waitFor();
  await palette.evaluate(async (dialog) => {
    await Promise.all(
      dialog
        .parentElement!.getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    );
  });
  assert.equal(
    await palette.evaluate((dialog) => dialog.getBoundingClientRect().bottom <= innerHeight),
    true,
  );

  await mkdir("screenshots", { recursive: true });
  await page.screenshot({ path: resolve("screenshots/command-palette.png") });
  await page.keyboard.press("Escape");
  console.log(
    "Command gate passed: palette/search/help, platform shortcuts, disabled reasons, native editing, modal suppression, refresh/draft retention, focus modes and stale-profile rejection.",
  );
} catch (error) {
  if (app) {
    await mkdir("screenshots", { recursive: true });
    await app
      .windows()[0]
      ?.screenshot({ path: resolve("screenshots/commands-gate-failure.png") })
      .catch(() => {});
  }

  throw error;
} finally {
  if (app) await app.close().catch(() => app?.process().kill());
  assert.ok(resolve(root).startsWith(resolve(tmpdir(), "eda-commands-gate-")));
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
