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

export default defineConfig(async () => {
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
            await startup([resolve("."), "--no-sandbox"], {
              env: devElectronEnv(),
              stdio: ["inherit", "inherit", "pipe", "ipc"],
            });
            (process as NodeJS.Process & { electronApp?: ChildProcess }).electronApp?.stderr
              ?.pipe(electronStderr(process.env["EDA_CHROMIUM_DIAGNOSTICS"] === "1"))
              .pipe(process.stderr, { end: false });
          },
          vite: {
            define: {
              __EDA_GITHUB_CLIENT_ID__: JSON.stringify(
                process.env["EDA_GITHUB_CLIENT_ID"] ?? "Iv23liejwZS2ySIUwhyG",
              ),
              __EDA_GITHUB_APP_SLUG__: JSON.stringify(
                process.env["EDA_GITHUB_APP_SLUG"] ?? "eda-desktop",
              ),
            },
            resolve: {
              alias: {
                "@shared": resolve("./src/shared"),
                "@main": resolve("./src/main"),
              },
            },
            build: {
              outDir: resolve("./dist/main"),
              rollupOptions: { external: ["electron", "electron-updater", "node:sqlite"] },
            },
          },
        },
        preload: {
          input: resolve("./src/main/preload.ts"),
          vite: {
            define: { __EDA_BUILD_INFO__: JSON.stringify(buildInfo) },
            resolve: { alias: { "@shared": resolve("./src/shared") } },
            build: { outDir: resolve("./dist/preload") },
          },
        },
      }),
    ],
    build: {
      outDir: resolve("./dist/renderer"),
      emptyOutDir: true,
    },
  };
});
