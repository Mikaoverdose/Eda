import { afterEach, expect, it, vi } from "vitest";
import {
  UpdateService,
  UPDATE_CHECK_INTERVAL,
  UPDATE_STARTUP_DELAY,
  newerRelease,
  type UpdateDriver,
  type UpdateOptions,
} from "@main/application/update-service";
import { releaseFromManifest } from "@main/application/update-manifest";
import type { UpdateProgress } from "@shared/updates";
import type { UpdateInfo } from "electron-updater";
import { createHash } from "node:crypto";

const release = {
  version: "0.0.2",
  name: "Eda 0.0.2-012345abcdef",
  notes: "Changes",
  releasedAt: null,
};

function fixture(overrides: Partial<UpdateOptions> = {}) {
  let progress: ((value: UpdateProgress) => void) | undefined;
  const driver: UpdateDriver = {
    check: vi.fn(async () => ({ available: true, release })),
    download: vi.fn(async (listener) => {
      progress = listener;
    }),
    cancel: vi.fn(),
    install: vi.fn(),
  };
  const rollback = vi.fn();
  const options: UpdateOptions = {
    capability: "automatic",
    reason: null,
    platform: "win",
    arch: "x64",
    currentVersion: "0.0.1",
    automaticChecks: () => true,
    createDriver: vi.fn(() => driver),
    prepareInstall: vi.fn(async () => rollback),
    ...overrides,
  };
  const service = new UpdateService(options);
  return {
    service,
    driver,
    options,
    rollback,
    progress: (value: UpdateProgress) => progress?.(value),
  };
}

afterEach(() => vi.useRealTimers());

it("deduplicates checks and requires separate verified download and installation actions", async () => {
  const { service, driver, options } = fixture();
  const revisions: number[] = [];
  service.onChange((value) => revisions.push(value.revision));
  expect(() => service.download()).toThrow(/before downloading/);
  await expect(service.install()).rejects.toThrow(/before installing/);

  const check = service.check();
  expect(service.check()).toBe(check);
  await check;
  expect(driver.check).toHaveBeenCalledTimes(1);
  expect(service.snapshot().phase).toBe("available");
  expect(driver.download).not.toHaveBeenCalled();
  expect(options.createDriver).toHaveBeenCalledWith(
    "https://eda.kirameki.cafe/api/updates/v1/stable/win/x64/",
    expect.any(Function),
  );

  await service.download();
  expect(service.snapshot().phase).toBe("ready");
  expect(driver.install).not.toHaveBeenCalled();
  await service.install();
  expect(options.prepareInstall).toHaveBeenCalledOnce();
  expect(driver.install).toHaveBeenCalledOnce();
  expect(service.snapshot().phase).toBe("installing");
  await expect(service.install()).rejects.toThrow();
  expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
});

it("cancels downloads, rejects unverified installers, and preserves a retryable release", async () => {
  const { service, driver, progress } = fixture();
  await service.check();
  let fail!: (error: Error) => void;
  vi.mocked(driver.download).mockImplementationOnce((listener) => {
    listener({ percent: 25, transferred: 25, total: 100, bytesPerSecond: 1 });
    return new Promise((_, reject) => {
      fail = reject;
    });
  });
  vi.mocked(driver.cancel).mockImplementation(() => fail(new Error("Cancelled")));
  const downloading = service.download();
  await Promise.resolve();
  expect(service.snapshot().progress?.percent).toBe(25);
  expect(service.download()).toBe(downloading);
  await service.cancel();
  expect(service.snapshot()).toMatchObject({ phase: "available", error: null, progress: null });

  vi.mocked(driver.download).mockRejectedValueOnce(new Error("sha512 checksum mismatch"));
  await service.download();
  expect(service.snapshot().error).toMatch(/could not be verified/);
  expect(service.snapshot().phase).toBe("available");
  await expect(service.install()).rejects.toThrow();
  expect(driver.install).not.toHaveBeenCalled();
  progress({ percent: 90, transferred: 90, total: 100, bytesPerSecond: 1 });
  expect(service.snapshot().progress).toBeNull();

  const count = vi.mocked(driver.download).mock.calls.length;
  service.download();
  await service.cancel();
  expect(driver.download).toHaveBeenCalledTimes(count);
});

it("retries absent feeds and synchronous setup failures without claiming up-to-date", async () => {
  const { service, driver, options } = fixture();
  vi.mocked(options.createDriver).mockImplementationOnce(() => {
    throw new Error("network failed");
  });
  await service.check();
  expect(service.snapshot().phase).toBe("error");
  vi.mocked(driver.check).mockRejectedValueOnce(
    new Error("404 ERR_UPDATER_LATEST_VERSION_NOT_FOUND"),
  );
  await service.check();
  expect(service.snapshot().error).toMatch(/not available yet/);
  await service.check();
  expect(service.snapshot().phase).toBe("available");
});

it("compares numeric stable releases, refuses same-version rebuilds and discovers later offers", async () => {
  expect(newerRelease("0.0.10", "0.0.9")).toBe(true);
  expect(newerRelease("0.0.1", "0.0.1")).toBe(false);
  expect(newerRelease("0.0.1", "0.1.0")).toBe(false);
  expect(() => newerRelease("0.0.1-abcdef-dirty", "0.0.1")).toThrow();
  const { service, driver } = fixture();
  vi.mocked(driver.check).mockResolvedValueOnce({
    available: true,
    release: { ...release, version: "0.0.1" },
  });
  await service.check();
  expect(service.snapshot().phase).toBe("current");
  await service.check();
  vi.mocked(driver.check).mockResolvedValueOnce({
    available: true,
    release: { ...release, version: "0.0.3" },
  });
  await service.check();
  expect(service.snapshot().release?.version).toBe("0.0.3");
});

it("does not check or replace development and manual installations", async () => {
  for (const capability of ["development", "manual"] as const) {
    const { service, options } = fixture({ capability });
    vi.useFakeTimers();
    service.start();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL * 2);
    expect(options.createDriver).not.toHaveBeenCalled();
    expect(() => service.check()).toThrow();
    service.stop();
    vi.useRealTimers();
  }
});

it("honors the application setting, startup delay and periodic checks", async () => {
  vi.useFakeTimers();
  let enabled = true;
  const { service, driver } = fixture({ automaticChecks: () => enabled });
  vi.mocked(driver.check).mockResolvedValue({ available: false, release });
  service.start();
  await vi.advanceTimersByTimeAsync(UPDATE_STARTUP_DELAY - 1);
  expect(driver.check).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(driver.check).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL);
  expect(driver.check).toHaveBeenCalledTimes(2);
  enabled = false;
  service.refreshSchedule();
  await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL);
  expect(driver.check).toHaveBeenCalledTimes(2);
  service.stop();
});

it("recovers from shutdown refusal and asynchronous native installation failures", async () => {
  const { service, driver, options, rollback } = fixture();
  await service.check();
  await service.download();
  vi.mocked(options.prepareInstall).mockRejectedValueOnce(new Error("Busy"));
  await service.install();
  expect(service.snapshot().phase).toBe("ready");
  expect(driver.install).not.toHaveBeenCalled();
  await service.install();
  const installError = vi.mocked(options.createDriver).mock.calls[0]![1];
  installError(new Error("signature verification failed"));
  expect(service.snapshot()).toMatchObject({
    phase: "ready",
    error: expect.stringContaining("verified"),
  });
  expect(rollback).toHaveBeenCalledOnce();
});

it("accepts generated metadata while refusing off-origin, insecure or checksumless artifacts", () => {
  const feed = "https://eda.kirameki.cafe/api/updates/v1/stable/win/x64/";
  const info: UpdateInfo = {
    path: "Eda-0.0.2-win-x64.exe",
    sha512: createHash("sha512").update("fixture").digest("base64"),
    version: "0.0.2",
    releaseName: release.name,
    releaseDate: "2026-10-31T00:00:00Z",
    files: [
      {
        url: "Eda-0.0.2-win-x64.exe",
        sha512: createHash("sha512").update("fixture").digest("base64"),
        size: 7,
      },
    ],
    releaseNotes: "<script>These notes are rendered as text.</script>",
  };
  expect(releaseFromManifest(info, feed)).toMatchObject({
    version: "0.0.2",
    notes: info.releaseNotes,
  });
  for (const url of [
    "http://eda.kirameki.cafe/file",
    "https://other.example/file",
    "file:///tmp/app.exe",
    "https://user@eda.kirameki.cafe/file",
  ]) {
    expect(() =>
      releaseFromManifest({ ...info, files: [{ ...info.files[0]!, url }] }, feed),
    ).toThrow(/Invalid update/);
  }
  expect(() =>
    releaseFromManifest({ ...info, files: [{ ...info.files[0]!, sha512: "bad" }] }, feed),
  ).toThrow();
  expect(() => releaseFromManifest({ ...info, files: [] }, feed)).toThrow();
});
