import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { prepareDevelopmentDesktop } from "../../scripts/development-desktop.ts";
import { DEVELOPMENT_DESKTOP } from "../../src/shared/application.ts";

test("registers a separate development identity with the current checkout icon", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "eda-desktop-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, "Eda checkout");
  const path = await prepareDevelopmentDesktop(project, root);
  assert.equal(path, join(root, "applications", DEVELOPMENT_DESKTOP.file));
  const entry = await readFile(path, "utf8");
  assert.ok(entry.includes("Name=Eda Dev\n"));
  assert.ok(entry.includes(`Icon=${join(project, "build/icon.png")}\n`));
  assert.ok(entry.includes(`StartupWMClass=${DEVELOPMENT_DESKTOP.id}\n`));
  assert.ok(entry.includes("NoDisplay=true\n"));

  const moved = join(root, "moved checkout");
  await prepareDevelopmentDesktop(moved, root);
  assert.ok((await readFile(path, "utf8")).includes(`Icon=${join(moved, "build/icon.png")}\n`));
});

test("escapes checkout names so they cannot inject desktop entry fields", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "eda-desktop-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = await prepareDevelopmentDesktop(join(root, "Eda\nHidden=true"), root);
  const entry = await readFile(path, "utf8");
  assert.ok(!entry.includes("\nHidden=true"));
  assert.ok(entry.includes("Eda\\nHidden=true"));
});
