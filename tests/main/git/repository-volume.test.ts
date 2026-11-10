import { RepositoryVolumeIdentity } from "@main/git/security/repository-volume";
import { readdir, stat } from "node:fs/promises";
import type * as Fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { FakeProcessRunner } from "../../helpers/fake-process-runner";

vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof Fs>();
  return { ...fs, readdir: vi.fn(fs.readdir), stat: vi.fn(fs.stat) };
});

afterEach(() => {
  vi.mocked(readdir).mockReset();
  vi.mocked(stat).mockReset();
});

const uuid = "cd699f81-2b43-4792-a146-6d38574df622";
const readDirectoryNames: (path: string) => Promise<string[]> = readdir;
const df =
  "Filesystem 512-blocks Used Available Capacity Mounted on\n/dev/disk3s1 100 50 50 50% /data\n";

it("uses the macOS volume UUID across different boot device numbers", async () => {
  const runner = new FakeProcessRunner()
    .on(["-P"], { stdout: df })
    .on(["info"], { stdout: `<key>VolumeUUID</key><string>${uuid.toUpperCase()}</string>` });

  expect(await new RepositoryVolumeIdentity(runner, "darwin").identify("/data/repo", 10n)).toBe(
    `uuid:${uuid}`,
  );
  expect(await new RepositoryVolumeIdentity(runner, "darwin").identify("/data/repo", 11n)).toBe(
    `uuid:${uuid}`,
  );
});

it("retries volume discovery after a temporary startup failure", async () => {
  const runner = new FakeProcessRunner()
    .on(["-P"], { stdout: df })
    .on(["info"], { stdout: `<key>VolumeUUID</key><string>${uuid}</string>` });
  vi.spyOn(runner, "run").mockResolvedValueOnce({
    exitCode: 1,
    stdout: Buffer.alloc(0),
    stderr: Buffer.from("volume not ready"),
    cancelled: false,
  });
  const volumes = new RepositoryVolumeIdentity(runner, "darwin");
  expect(await volumes.identify("/data/repo", 10n)).toBe("10");
  expect(await volumes.identify("/data/repo", 10n)).toBe(`uuid:${uuid}`);
});

it.each([
  { exitCode: 1, stdout: `<key>VolumeUUID</key><string>${uuid}</string>` },
  { cancelled: true },
  { outputLimitExceeded: "stdout" as const },
  { stdout: "<key>VolumeUUID</key><string>invalid</string>" },
])("keeps strict device matching when macOS volume discovery fails: %j", async (response) => {
  const runner = new FakeProcessRunner().on(["-P"], { stdout: df }).on(["info"], response);
  expect(await new RepositoryVolumeIdentity(runner, "darwin").identify("/data/repo", 10n)).toBe(
    "10",
  );
});

it("uses the UUID of the matching Linux block device across remounts", async () => {
  const info = await stat(fileURLToPath(import.meta.url), { bigint: true });
  info.isBlockDevice = () => true;
  info.rdev = 10n;
  vi.mocked(stat).mockResolvedValue(info);
  vi.mocked(readDirectoryNames).mockResolvedValue([uuid]);
  const runner = new FakeProcessRunner();
  expect(await new RepositoryVolumeIdentity(runner, "linux").identify("/data/repo", 10n)).toBe(
    `uuid:${uuid}`,
  );
  info.rdev = 11n;
  expect(await new RepositoryVolumeIdentity(runner, "linux").identify("/data/repo", 11n)).toBe(
    `uuid:${uuid}`,
  );
  expect(await new RepositoryVolumeIdentity(runner, "linux").identify("/other/repo", 12n)).toBe(
    "12",
  );
});

it("keeps strict device matching on Linux when UUIDs are inaccessible", async () => {
  vi.mocked(readdir).mockRejectedValue(Object.assign(new Error("denied"), { code: "EACCES" }));
  expect(
    await new RepositoryVolumeIdentity(new FakeProcessRunner(), "linux").identify(
      "/data/repo",
      10n,
    ),
  ).toBe("10");
});

it("preserves the Windows volume serial number", async () => {
  const volumes = new RepositoryVolumeIdentity(new FakeProcessRunner(), "win32");
  expect(await volumes.identify("C:\\repo", 10n)).toBe("10");
  expect(await volumes.identify("D:\\repo", 11n)).toBe("11");
});
