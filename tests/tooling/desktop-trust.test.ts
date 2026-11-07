import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ElectronApplication } from "playwright";
import { trustFixture } from "../desktop/helpers/trust.ts";

test("desktop trust accepts canonical fixture paths and preserves prompts outside the fixture", async () => {
  const root = await mkdtemp(join(tmpdir(), "eda-trust-helper-"));
  try {
    const directory = join(root, "original");
    const alias = join(root, "alias");
    await mkdir(directory);
    await symlink(directory, alias, "junction");
    const canonical = await realpath(directory);
    const dialog = {
      showMessageBox: async (_options: Electron.MessageBoxOptions) => ({
        response: 0,
        checkboxChecked: false,
      }),
    };
    const app = {
      evaluate: async (callback: (...args: unknown[]) => unknown, args: unknown) =>
        callback({ dialog }, args),
    } as unknown as ElectronApplication;
    await trustFixture(app, alias);

    for (const base of [alias, canonical]) {
      assert.equal(
        (
          await dialog.showMessageBox({
            title: "Repository trust",
            message: "Trust repository?",
            detail: join(base, "repository") + "\nRepository-selected programs may run.",
          })
        ).response,
        1,
      );
      assert.equal(
        (
          await dialog.showMessageBox({
            buttons: ["Cancel", "Allow program"],
            message: "Allow program?",
            detail: JSON.stringify([join(base, "tool")]),
          })
        ).response,
        1,
      );
    }
    assert.equal(
      (
        await dialog.showMessageBox({
          title: "Repository trust",
          message: "Trust repository?",
          detail: join(root, "outside", "repository"),
        })
      ).response,
      0,
    );
    assert.equal(
      (
        await dialog.showMessageBox({
          title: "Repository trust",
          message: "Trust repository?",
          detail: canonical + "-other/repository",
        })
      ).response,
      0,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
