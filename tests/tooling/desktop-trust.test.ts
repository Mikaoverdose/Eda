import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ElectronApplication } from "playwright";
import { trustFixture } from "../desktop/helpers/trust.ts";

test("desktop trust accepts canonical fixture paths and preserves prompts outside the fixture", async () => {
  const root = await mkdtemp(join(tmpdir(), "eda-trust-helper-"));
  const previousWindow = globalThis.window;
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
    const responses: string[] = [];
    let changed: (request: { id: string; path: string } | null) => void = () => {};
    Object.assign(globalThis, {
      window: {
        eda: {
          repository: {
            pendingTrust: async () => ({ ok: true, value: null }),
            respondTrust: async (id: string) => {
              responses.push(id);
            },
          },
          events: {
            onRepositoryTrustChanged: (handler: typeof changed) => {
              changed = handler;
            },
          },
        },
      },
    });
    const app = {
      firstWindow: async () => ({
        addInitScript: async () => {},
        evaluate: async (callback: (args: unknown) => unknown, args: unknown) => callback(args),
      }),
      evaluate: async (callback: (...args: unknown[]) => unknown, args: unknown) =>
        callback({ dialog }, args),
    } as unknown as ElectronApplication;
    await trustFixture(app, alias);

    for (const base of [alias, canonical]) {
      changed({ id: base, path: join(base, "repository") });
      assert.ok(responses.includes(base));
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
    changed({ id: "outside", path: join(root, "outside", "repository") });
    changed({ id: "prefix", path: canonical + "-other/repository" });
    assert.equal(responses.includes("outside"), false);
    assert.equal(responses.includes("prefix"), false);
  } finally {
    Object.assign(globalThis, { window: previousWindow });
    await rm(root, { recursive: true, force: true });
  }
});
