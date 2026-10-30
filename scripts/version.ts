import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildInfo } from "../src/shared/version.ts";

export function readBuildInfo(root = fileURLToPath(new URL("../", import.meta.url))): BuildInfo {
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    version: string;
  };

  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw new Error("Eda's package.json version must be a stable semantic version (X.Y.Z).");

  let commit: string | null = null;
  let dirty: boolean | null = null;
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      maxBuffer: 16 * 1024 * 1024,
    }).trim();

  try {
    if (realpathSync(git("rev-parse", "--show-toplevel")) === realpathSync(root)) {
      const head = git("rev-parse", "--verify", "HEAD");
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) throw new Error("Invalid Git commit.");

      commit = head;
      dirty =
        git("status", "--porcelain=v1", "--untracked-files=normal", "--ignore-submodules=none") !==
        "";
    }
  } catch {}

  const revision = commit ? commit.slice(0, 12) : "unknown";
  const suffix = dirty === true ? "-dirty" : dirty === null && commit ? "-unknown" : "";

  return { version, displayVersion: `${version}-${revision}${suffix}`, commit, dirty };
}
