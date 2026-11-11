import { expect, it, vi } from "vitest";
import { VelopackUpdater } from "@main/application/velopack-updater";
import type { UpdateInfo } from "velopack";

const update: UpdateInfo = {
  TargetFullRelease: {
    PackageId: "Eda",
    Version: "0.0.2",
    Type: "Full",
    FileName: "Eda-0.0.2-linux-x64-stable-full.nupkg",
    SHA1: "a".repeat(40),
    SHA256: "b".repeat(64),
    Size: 100,
    NotesMarkdown: "Changes",
    NotesHtml: "",
  },
  DeltasToTarget: [],
  IsDowngrade: false,
};

function fixture() {
  const manager = {
    getCurrentVersion: vi.fn(() => "0.0.1"),
    checkForUpdatesAsync: vi.fn(async (): Promise<UpdateInfo | null> => update),
    downloadUpdateAsync: vi.fn(async (_update: UpdateInfo, progress?: (value: number) => void) => {
      progress?.(45);
    }),
    waitExitThenApplyUpdate: vi.fn(),
  };
  const quit = vi.fn();

  return { manager, quit, driver: new VelopackUpdater(manager, quit, async () => {}) };
}

it("waits for verified download, then starts the native helper before quitting", async () => {
  const { driver, manager, quit } = fixture();

  expect(() => driver.install()).toThrow();
  expect(await driver.check()).toMatchObject({ available: true, release: { version: "0.0.2" } });
  expect(() => driver.install()).toThrow();
  const progress = vi.fn();

  await driver.download(progress);
  expect(progress).toHaveBeenCalledWith({ percent: 45 });

  driver.install();
  expect(manager.waitExitThenApplyUpdate).toHaveBeenCalledWith(update, false, true);
  expect(manager.waitExitThenApplyUpdate.mock.invocationCallOrder[0]).toBeLessThan(
    quit.mock.invocationCallOrder[0]!,
  );
});

it("does not quit or install when downloading or starting the helper fails", async () => {
  const { driver, manager, quit } = fixture();

  await driver.check();
  manager.downloadUpdateAsync.mockRejectedValueOnce(new Error("SHA256 checksum mismatch"));
  await expect(driver.download(vi.fn())).rejects.toThrow("checksum");
  expect(() => driver.install()).toThrow();

  await driver.download(vi.fn());
  manager.waitExitThenApplyUpdate.mockImplementationOnce(() => {
    throw new Error("helper unavailable");
  });

  expect(() => driver.install()).toThrow("helper unavailable");
  expect(quit).not.toHaveBeenCalled();
});

it("never installs a discarded download and ignores progress after discard", async () => {
  const { driver, manager } = fixture();
  await driver.check();

  let finish!: () => void;
  let report!: (value: number) => void;
  manager.downloadUpdateAsync.mockImplementationOnce((_update, progress) => {
    report = progress!;
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });

  const progress = vi.fn();
  const downloading = driver.download(progress);
  await vi.waitFor(() => expect(manager.downloadUpdateAsync).toHaveBeenCalledOnce());
  driver.discardDownload();
  report(90);
  finish();
  await downloading;

  expect(progress).not.toHaveBeenCalled();
  expect(() => driver.install()).toThrow();
});

it("handles no update and rejects downgrade offers", async () => {
  const { driver, manager } = fixture();

  manager.checkForUpdatesAsync.mockResolvedValueOnce(null);
  expect(await driver.check()).toMatchObject({ available: false, release: { version: "0.0.1" } });

  manager.checkForUpdatesAsync.mockResolvedValueOnce({ ...update, IsDowngrade: true });
  expect(await driver.check()).toMatchObject({ available: false });
  await expect(driver.download(vi.fn())).rejects.toThrow();
});

it("binds the native download to the platform's published GitHub release digest", async () => {
  const { verifyPublishedPackage } = await import("@main/application/velopack-updater");
  const asset = update.TargetFullRelease;
  const request = vi.fn(async () =>
    Response.json({
      tag_name: asset.Version,
      draft: false,
      assets: [{ name: asset.FileName, size: asset.Size, digest: "sha256:" + asset.SHA256 }],
    }),
  );
  await verifyPublishedPackage(asset, "linux-x64-stable", request);
  await expect(
    verifyPublishedPackage({ ...asset, SHA256: "0".repeat(64) }, "linux-x64-stable", request),
  ).rejects.toThrow();
  await expect(
    verifyPublishedPackage({ ...asset, FileName: "../elsewhere" }, "linux-x64-stable", request),
  ).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(2);
});

it("propagates asynchronous restart failures after scheduling the native update helper", async () => {
  const { driver, manager, quit } = fixture();
  await driver.check();
  await driver.download(vi.fn());
  quit.mockRejectedValueOnce(new Error("fixture restart failure"));
  await expect(driver.install()).rejects.toThrow("fixture restart failure");
  expect(manager.waitExitThenApplyUpdate).toHaveBeenCalledExactlyOnceWith(update, false, true);
});
