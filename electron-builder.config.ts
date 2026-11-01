import type { Configuration } from "electron-builder";
import { prepareGit } from "./scripts/prepare-git.ts";
import { readBuildInfo } from "./scripts/build.ts";
import { UPDATE_FEED_BASE } from "./src/shared/updates.ts";

const buildInfo = readBuildInfo();

export default {
  appId: "cafe.kirameki.eda",
  productName: "Eda",
  publish: { provider: "generic", url: `${UPDATE_FEED_BASE}\${os}/\${arch}/`, channel: "latest" },
  releaseInfo: { releaseName: `Eda ${buildInfo.displayVersion}` },
  artifactName: `Eda-${buildInfo.version}-${buildInfo.commit?.slice(0, 12) ?? "unknown"}-\${os}-\${arch}.\${ext}`,
  forceCodeSigning: process.env["EDA_RELEASE"] === "1",
  protocols: [{ name: "Eda repository links", schemes: ["eda"] }],
  directories: { output: "release" },
  files: ["dist/**/*", "package.json"],
  extraResources: [
    { from: "vendor/git/${os}-${arch}", to: "git", filter: ["**/*"] },
    { from: "LICENSE", to: "LICENSE" },
    {
      from: "src/renderer/assets/providers",
      to: "licenses/provider-icons",
      filter: ["LICENSE-*.txt", "README.md"],
    },
  ],
  beforePack: async (context) => {
    if (process.env["EDA_RELEASE"] === "1" && readBuildInfo().dirty !== false)
      throw new Error("Official Eda releases require a clean Git checkout with a known commit.");
    const arch = ({ 1: "x64", 3: "arm64" } as Record<number, string>)[context.arch];
    if (!arch) throw new Error("Eda packages support x64 and arm64.");
    await prepareGit(context.electronPlatformName, arch);
  },
  win: { target: "nsis" },
  mac: { target: ["dmg", "zip"], category: "public.app-category.developer-tools" },
  linux: { target: "AppImage", category: "Development" },
} satisfies Configuration;
