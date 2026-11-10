import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import type { ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareGit } from "./scripts/prepare-git.ts";
import { electronStderr, readBuildInfo, prepareComponentInventory } from "./scripts/build.ts";

const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url));

function devElectronEnv(): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    NODE_OPTIONS: "--no-warnings=ExperimentalWarning",
  };
}

export default defineConfig(async ({ command }) => {
  await Promise.all([prepareGit(), prepareComponentInventory()]);
  const buildInfo = readBuildInfo();

  return {
    root: resolve("./src/renderer"),
    server: { host: "127.0.0.1" },
    resolve: {
      alias: {
        "@shared": resolve("./src/shared"),
        "@renderer": resolve("./src/renderer"),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      electron({
        main: {
          entry: resolve("./src/main/index.ts"),
          onstart: async ({ startup }) => {
            await startup([resolve(".")], {
              env: devElectronEnv(),
              stdio: ["inherit", "inherit", "pipe", "ipc"],
            });

            (process as NodeJS.Process & { electronApp?: ChildProcess }).electronApp?.stderr
              ?.pipe(electronStderr(process.env["EDA_CHROMIUM_DIAGNOSTICS"] === "1"))
              .pipe(process.stderr, { end: false });
          },
          vite: {
            resolve: {
              alias: {
                "@shared": resolve("./src/shared"),
                "@main": resolve("./src/main"),
              },
            },
            build: {
              minify: command === "build",
              outDir: resolve("./dist/main"),
              rolldownOptions: {
                external: ["electron", "velopack", "node:sqlite"],
                output: { minify: command === "build" },
              },
            },
          },
        },
        preload: {
          input: resolve("./src/main/preload.ts"),
          vite: {
            define: { __EDA_BUILD_INFO__: JSON.stringify(buildInfo) },
            resolve: { alias: { "@shared": resolve("./src/shared") } },
            build: { minify: command === "build", outDir: resolve("./dist/preload") },
          },
        },
      }),
    ],
    build: {
      outDir: resolve("./dist/renderer"),
      emptyOutDir: true,
      manifest: true,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [{ name: "messages", test: /[\\/]shared[\\/]locales[\\/]/ }],
          },
        },
      },
    },
  };
});
