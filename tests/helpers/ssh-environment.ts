import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundledGitEnvironment, bundledGitLocation } from "@main/git/execution/bundled-git";

export async function sshTestEnvironment(): Promise<Record<string, string>> {
  if (process.platform !== "win32") return {};

  const root = bundledGitLocation(false, fileURLToPath(new URL("../../", import.meta.url)), "");
  try {
    await Promise.all(
      ["ssh", "ssh-agent", "ssh-add", "ssh-keygen", "sh"].map((tool) =>
        access(join(root, "usr/bin", `${tool}.exe`)),
      ),
    );
  } catch (cause) {
    throw new Error("Run node scripts/prepare-git.ts before Windows SSH integration tests.", {
      cause,
    });
  }
  return { PATH: bundledGitEnvironment(root)["PATH"]! };
}
