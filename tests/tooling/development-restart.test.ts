import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { DEVELOPMENT_RESTART } from "../../src/shared/application.ts";
import { fixtureEnvironment } from "../helpers/fixture-environment.ts";

for (const action of ["restart", "import-release-data"] as const) {
  test(`the Vite host survives ${action} and starts the replacement with only the required arguments`, async () => {
    const root = await mkdtemp(join(tmpdir(), "eda-dev-restart-"));
    try {
      const module = join(root, "node_modules", "fixture-electron");
      await mkdir(module, { recursive: true });
      await writeFile(join(root, "package.json"), '{"type":"module"}');
      await writeFile(
        join(module, "index.js"),
        `module.exports = ${JSON.stringify(process.execPath)};`,
      );
      const plugin = import.meta.resolve("vite-plugin-electron");
      const supervisor = new URL("../../scripts/development-restart.ts", import.meta.url).href;
      const child = join(root, "child.mjs");
      await writeFile(
        child,
        `
      if (process.argv.includes("--replacement")) {
        console.log("replacement started: import=" + process.argv.includes(${JSON.stringify(DEVELOPMENT_RESTART.argument)}));
        process.exit(0);
      }
      process.on("message", (message) => {
        if (message !== ${JSON.stringify(DEVELOPMENT_RESTART.ready)}) return;
        console.log("original saved and exited");
        process.exit(0);
      });
      process.send(${JSON.stringify(action === "import-release-data" ? DEVELOPMENT_RESTART.importRequest : DEVELOPMENT_RESTART.request)});
    `,
      );
      const host = join(root, "host.mjs");
      await writeFile(
        host,
        `
      import { startup } from ${JSON.stringify(plugin)};
      import { watchDevelopmentRestart } from ${JSON.stringify(supervisor)};
      const launch = async (args = []) => {
        await startup([${JSON.stringify(child)}, ...args], {
          cwd: ${JSON.stringify(root)}, stdio: ["ignore", "pipe", "pipe", "ipc"],
        }, "fixture-electron");
        const child = process.electronApp;
        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stderr);
        watchDevelopmentRestart(child, () => startup.exit(0),
          (action) => launch(["--replacement", ...(action === "import-release-data" ? [${JSON.stringify(DEVELOPMENT_RESTART.argument)}] : [])]),
          (error) => { console.error(error); process.exitCode = 1; });
      };
      await launch();
    `,
      );
      const { stdout } = await promisify(execFile)(process.execPath, [host], {
        cwd: fileURLToPath(new URL("../..", import.meta.url)),
        env: fixtureEnvironment(root),
        timeout: 20_000,
      });
      assert.match(stdout, /original saved and exited[\s\S]*replacement started/);
      assert.match(
        stdout,
        new RegExp(`replacement started: import=${action === "import-release-data"}`),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
