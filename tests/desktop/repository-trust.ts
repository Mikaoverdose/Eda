import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ElectronApplication } from "playwright";
import { expect } from "playwright/test";
import { electron } from "../helpers/fixture-electron.ts";
import { fixtureEnvironment } from "../helpers/fixture-environment.ts";
import { finishOnboarding } from "./helpers/onboarding.ts";

const root = await mkdtemp(join(tmpdir(), "eda-repository-trust-"));
const source = join(root, "source");
const destination = join(root, "cloned repo");
const env = fixtureEnvironment(root);
let app: ElectronApplication | undefined;

try {
  await mkdir(source);
  await writeFile(join(root, "gitconfig"), "[user]\nname = Fixture\nemail = fixture@example.com\n");
  const git = (...args: string[]) => execFileSync("git", ["-C", source, ...args], { env });
  git("init", "-b", "main");
  await writeFile(join(source, "README.md"), "Trust fixture\n");
  git("add", ".");
  git("commit", "-m", "Initial");

  app = await electron.launch({
    args: ["dist/main/index.js", "--no-sandbox", `--user-data-dir=${join(root, "user-data")}`],
    env,
  });
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error("Trust must use the in-app modal");
    };
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await page.getByRole("textbox", { name: /^Profile name/ }).fill("Work");
  await page.getByRole("textbox", { name: /^Git author name/ }).fill("Fixture");
  await page.getByRole("textbox", { name: /^Git email/ }).fill("fixture@example.com");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await finishOnboarding(page);

  await page.getByRole("button", { name: "Clone repository", exact: true }).click();
  const clone = page.getByRole("dialog", { name: "Clone repository", exact: true });
  const url = pathToFileURL(source).href;
  await clone.getByLabel("Repository URL", { exact: true }).fill(url);
  await clone.getByLabel("Clone parent folder").fill(root);
  await clone.getByLabel("Clone folder name").fill("cloned repo");
  await expect(clone.getByText("Destination path", { exact: true })).toHaveCount(0);
  await mkdir("screenshots", { recursive: true });
  await page.screenshot({ path: resolve("screenshots/clone-repository.png") });
  await clone.getByRole("button", { name: "Clone repository", exact: true }).click();

  const trust = page.getByRole("dialog", { name: "Repository trust", exact: true });
  await clone.waitFor({ state: "hidden" });
  await expect(trust).toHaveCount(0);
  await access(join(destination, "README.md"));
  const overview = page.locator('header[aria-label="Repository overview"]');
  await expect(overview.getByText("Untrusted", { exact: true })).toBeVisible();
  const badge = overview.getByRole("button", { name: "Untrusted", exact: true });
  await expect(badge).toBeEnabled();
  await page.screenshot({
    path: resolve("screenshots/repository-untrusted.png"),
    animations: "disabled",
  });
  await badge.click();
  await expect(trust).toContainText(destination);
  await expect(trust).toContainText("No executable features detected");
  await trust.getByRole("button", { name: "Keep disabled", exact: true }).click();
  await expect(badge).toBeEnabled();
  await badge.click();
  await trust.getByRole("button", { name: "Trust and enable", exact: true }).click();
  await expect(badge).toHaveCount(0);

  await writeFile(join(source, ".git/hooks/pre-commit"), "#!/bin/sh\necho executed > marker\n");
  await chmod(join(source, ".git/hooks/pre-commit"), 0o755);
  const opening = page.evaluate((path) => window.eda.repository.open(path), source);
  await expect(trust).toContainText("Keep them disabled unless you trust");
  await expect(trust).toContainText(source);
  await expect(trust.getByRole("button", { name: "Keep disabled", exact: true })).toBeFocused();
  await mkdir("screenshots", { recursive: true });
  await expect(trust.locator("details")).not.toHaveAttribute("open");
  await page.screenshot({
    path: resolve("screenshots/repository-trust.png"),
    animations: "disabled",
  });
  await trust.locator("summary").click();
  await expect(trust.getByText("hooks/pre-commit", { exact: true })).toBeVisible();
  await trust.getByRole("button", { name: "Keep disabled", exact: true }).click();
  const restricted = await opening;
  assert.equal(restricted.ok && restricted.value.trusted, false);
  const retry = page.evaluate((path) => window.eda.repository.open(path), source);
  await trust.getByRole("button", { name: "Trust and enable", exact: true }).click();
  const approved = await retry;
  assert.equal(approved.ok && approved.value.trusted, true);
  assert.equal((await page.evaluate((path) => window.eda.repository.open(path), source)).ok, true);
  await expect(trust).toHaveCount(0);
  await page.getByRole("button", { name: "Open a repository", exact: true }).click();
  await page.getByRole("heading", { name: "Repositories", exact: true }).waitFor();
  await expect(page.getByRole("button", { name: /trust/i })).toHaveCount(0);
  await page.screenshot({ path: resolve("screenshots/repository-list.png") });
  await page.getByRole("button", { name: "Open source", exact: true }).click();
  await expect(overview).toBeVisible();
  await expect(overview.getByText("Untrusted", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Open a repository", exact: true }).click();
  await page.getByRole("button", { name: "Edit source", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Repository settings", exact: true });
  await expect(settings.getByRole("button", { name: "Review trust…", exact: true })).toHaveCount(1);
  await page.screenshot({ path: resolve("screenshots/repository-settings.png") });
  await settings.getByRole("button", { name: "Review trust…", exact: true }).click();
  await expect(trust).toContainText(source);
  await trust.getByRole("button", { name: "Keep disabled", exact: true }).click();
  await expect(settings.getByRole("textbox", { name: "Repository display name" })).toHaveValue(
    "source",
  );
  await settings.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Remove source from profile", exact: true }).click();
  const removal = page.getByRole("dialog", {
    name: "Remove repository from profile?",
    exact: true,
  });
  await removal.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(removal).toHaveCount(0);
  await page.getByRole("button", { name: "Remove source from profile", exact: true }).click();
  await removal.getByRole("button", { name: "Remove from profile", exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit source", exact: true })).toHaveCount(0);
  await access(join(source, "README.md"));
  await access(join(source, ".git"));
  console.log(
    "Repository trust gate passed: quiet ordinary clones, restricted opening, approval and remembered trust.",
  );
} finally {
  await app?.close();
  await rm(root, { recursive: true, force: true });
}
