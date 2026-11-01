import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import {
  HttpSource,
  UpdateManager,
  type VelopackAsset,
  type VelopackLocatorConfig,
} from "velopack";

if (process.argv[2] === "--worker") {
  const config = JSON.parse(await readFile(process.argv[3]!, "utf8")) as {
    url: string;
    locator: VelopackLocatorConfig;
    asset: VelopackAsset;
    fromVersion: string;
  };

  const manager = new UpdateManager(
    new HttpSource(config.url, { TimeoutMilliseconds: 30_000 }),
    {
      AllowVersionDowngrade: false,
      MaximumDeltasBeforeFallback: -1,
      ExplicitChannel: `linux-${process.arch}-stable`,
    },
    config.locator,
  );
  assert.equal(manager.getCurrentVersion(), config.fromVersion);

  const update = await manager.checkForUpdatesAsync();
  assert.ok(update);
  assert.equal(update.TargetFullRelease.Version, config.asset.Version);

  await assert.rejects(manager.downloadUpdateAsync(update), /checksum|hash|sha256/i);
  assert.equal(await readFile(config.locator.RootAppDir, "utf8"), "previous version");

  await manager.downloadUpdateAsync(update);
  assert.equal(manager.getUpdatePendingRestart()?.Version, config.asset.Version);
  manager.waitExitThenApplyUpdate(update, false, false);
  process.exit(0);
} else {
  assert.equal(process.platform, "linux", "Run this packaged update test on Linux.");

  const output = resolve(process.argv[2] ?? "release/velopack");
  const channel = `linux-${process.arch}-stable`;
  const feed = JSON.parse(await readFile(join(output, `releases.${channel}.json`), "utf8")) as {
    Assets: VelopackAsset[];
  };
  const asset = feed.Assets[0]!;
  const fromVersion = `${asset.Version}-smoketest`;
  const image = join(output, `Eda-${asset.Version}-${channel}.AppImage`);
  const packagePath = join(output, asset.FileName);
  const root = await mkdtemp(join(tmpdir(), "eda-native-update-"));
  let packageDownloads = 0;

  const server = createServer((request, response) => {
    if (request.url?.startsWith(`/releases.${channel}.json`)) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(feed));
    } else if (request.url === `/${asset.FileName}`) {
      response.writeHead(302, { Location: `/assets/${asset.FileName}` });
      response.end();
    } else if (request.url === `/assets/${asset.FileName}`) {
      response.writeHead(200, { "Content-Length": asset.Size });

      if (packageDownloads++ === 0) {
        response.write(Buffer.from([0]));
        createReadStream(packagePath, { start: 1 }).pipe(response);
      } else createReadStream(packagePath).pipe(response);
    } else {
      response.writeHead(404);
      response.end();
    }
  });

  try {
    execFileSync(image, ["--appimage-extract"], { cwd: root, stdio: "ignore" });
    const binaries = join(root, "squashfs-root/usr/bin");
    const manifest = join(root, "sq.version");

    await writeFile(
      manifest,
      (await readFile(join(binaries, "sq.version"), "utf8")).replace(
        `<version>${asset.Version}</version>`,
        `<version>${fromVersion}</version>`,
      ),
    );

    const installedImage = join(root, "Eda.AppImage");
    await writeFile(installedImage, "previous version");
    await mkdir(join(root, "packages"));

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const config = join(root, "fixture.json");
    await writeFile(
      config,
      JSON.stringify({
        url: `http://127.0.0.1:${address.port}/`,
        fromVersion,
        asset,
        locator: {
          RootAppDir: installedImage,
          UpdateExePath: join(binaries, "UpdateNix"),
          PackagesDir: join(root, "packages"),
          ManifestPath: manifest,
          CurrentBinaryDir: binaries,
          IsPortable: true,
        },
      }),
    );

    const worker = spawn(process.execPath, [fileURLToPath(import.meta.url), "--worker", config], {
      stdio: "inherit",
    });
    const [code] = await once(worker, "exit");
    assert.equal(code, 0, "Native updater worker failed.");

    const expected = createHash("sha256")
      .update(await readFile(image))
      .digest("hex");
    let applied = false;

    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        applied =
          createHash("sha256")
            .update(await readFile(installedImage))
            .digest("hex") === expected;
      } catch {
        /* The helper may be between file replacement operations. */
      }

      if (applied) break;
      await setTimeout(200);
    }

    assert.ok(applied, "The native helper did not replace the disposable old AppImage.");
    assert.ok(packageDownloads >= 2);

    console.log(
      "Native Linux update passed: JSON feed, redirected download, rejection of corrupt package, verified retry, helper installation and byte-exact replacement.",
    );
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
}
