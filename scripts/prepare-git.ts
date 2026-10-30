import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";
import { x as extract } from "tar";

const project = fileURLToPath(new URL("..", import.meta.url));

interface GitArtifact {
  url: string;
  sha256: string;
}

const manifest = JSON.parse(
  await readFile(new URL("./bundled-git.json", import.meta.url), "utf8"),
) as {
  release: string;
  targets: Record<string, GitArtifact>;
};

const platforms: Record<string, string> = { win32: "win", darwin: "mac", linux: "linux" };

export function targetFor(platform: string, arch: string) {
  const artifact = manifest.targets[`${platform}-${arch}`];

  if (!artifact) throw new Error(`Bundled Git does not support ${platform}/${arch}.`);

  return {
    ...artifact,
    directory: `${platforms[platform]}-${arch}`,
    executable: platform === "win32" ? "cmd/git.exe" : "bin/git",
  };
}

export async function verifyArchive(path: string, expected: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest("hex") !== expected)
    throw new Error("Bundled Git checksum mismatch. Refusing to extract or run it.");
}

export async function prepareGit(platform: string = process.platform, arch: string = process.arch) {
  const target = targetFor(platform, arch);
  const parent = resolve(project, "vendor/git");
  const destination = join(parent, target.directory);

  try {
    const installed = JSON.parse(await readFile(join(destination, "eda-bundle.json"), "utf8"));
    await access(join(destination, target.executable));
    if (installed.sha256 === target.sha256) return destination;
  } catch {}

  const cache = resolve(project, ".cache/bundled-git");

  await mkdir(cache, { recursive: true });
  await mkdir(parent, { recursive: true });

  const archive = join(cache, `${target.sha256}.tar.gz`);

  try {
    await verifyArchive(archive, target.sha256);
  } catch {
    const partial = join(cache, `${target.sha256}.${process.pid}.download`);

    try {
      console.log(`Downloading bundled Git ${manifest.release} (${platform}/${arch})...`);

      const response = await fetch(target.url, { signal: AbortSignal.timeout(180_000) });

      if (!response.ok || !response.body)
        throw new Error(`Git download failed: HTTP ${response.status}`);

      await pipeline(response.body, createWriteStream(partial));
      await verifyArchive(partial, target.sha256);
      await rename(partial, archive);
    } finally {
      await rm(partial, { force: true });
    }
  }

  const staging = await mkdtemp(join(parent, ".extract-"));

  try {
    await extract({ file: archive, cwd: staging, strict: true, preservePaths: false });
    await access(join(staging, target.executable));
    await writeFile(
      join(staging, "eda-bundle.json"),
      JSON.stringify({ release: manifest.release, ...target }, null, 2),
    );

    if (dirname(destination) !== parent) throw new Error("Invalid Git bundle destination.");

    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
    console.log(`Bundled Git ready: ${destination}`);
  } finally {
    if (dirname(staging) !== parent) throw new Error("Invalid extraction directory.");
    await rm(staging, { recursive: true, force: true });
  }

  return destination;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await prepareGit(process.argv[2] ?? process.platform, process.argv[3] ?? process.arch);
}
