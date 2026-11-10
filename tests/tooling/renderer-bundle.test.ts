import assert from "node:assert/strict";
import { test } from "node:test";
import { startupChunks } from "../../scripts/renderer-bundle.ts";

test("startup includes the dynamic app entry and shared imports once, excluding deferred views", () => {
  const chunks = startupChunks({
    "index.html": {
      file: "entry.js",
      isEntry: true,
      imports: ["shared"],
      dynamicImports: ["app/App.tsx", "tutorial"],
    },
    "app/App.tsx": {
      file: "app.js",
      imports: ["shared", "workspace"],
      dynamicImports: ["settings", "dialogs"],
    },
    shared: { file: "shared.js", imports: ["cycle"] },
    cycle: { file: "cycle.js", imports: ["shared"] },
    workspace: { file: "workspace.js", imports: ["shared"] },
    settings: { file: "settings.js" },
    dialogs: { file: "dialogs.js" },
    tutorial: { file: "tutorial.js" },
  });

  assert.deepEqual(
    chunks,
    new Set(["entry.js", "shared.js", "cycle.js", "app.js", "workspace.js"]),
  );
});

test("fails rather than undercounting an incomplete manifest", () => {
  assert.throws(() => startupChunks({}), /no application entry/);

  assert.throws(
    () => startupChunks({ "app/App.tsx": { file: "app.js", imports: ["missing"] } }),
    /Missing renderer chunk/,
  );
});
