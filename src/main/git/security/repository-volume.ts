import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { ProcessSpawnError, type ProcessRunner } from "../execution/process-runner";

export class RepositoryVolumeIdentity {
  private readonly identities = new Map<bigint, Promise<string>>();

  constructor(
    private readonly runner: ProcessRunner,
    private readonly platform = process.platform,
  ) {}

  identify(path: string, device: bigint): Promise<string> {
    const pending = this.identities.get(device);
    if (pending) return pending;

    const result = this.resolve(path, device)
      .then((identity) => {
        if (!identity.startsWith("uuid:")) this.identities.delete(device);
        return identity;
      })
      .catch((error: unknown) => {
        this.identities.delete(device);
        throw error;
      });
    this.identities.set(device, result);
    return result;
  }

  private async resolve(path: string, device: bigint): Promise<string> {
    try {
      if (this.platform === "darwin") {
        const disks = await this.run("/bin/df", ["-P", path]);
        const disk = disks?.split("\n")[1]?.match(/^(\/dev\/disk[0-9]+(?:s[0-9]+)*)\s/)?.[1];
        if (disk) {
          const plist = await this.run("/usr/sbin/diskutil", ["info", "-plist", disk]);
          const uuid = plist?.match(
            /<key>VolumeUUID<\/key>\s*<string>([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})<\/string>/i,
          )?.[1];
          if (uuid) return `uuid:${uuid.toLowerCase()}`;
        }
      } else if (this.platform === "linux") {
        const directory = "/dev/disk/by-uuid";
        const entries = await readdir(directory);
        if (entries.length <= 256) {
          for (const uuid of entries) {
            if (!/^[0-9a-zA-Z-]+$/.test(uuid)) continue;
            const info = await stat(join(directory, uuid), { bigint: true });
            if (info.isBlockDevice() && info.rdev === device) return `uuid:${uuid.toLowerCase()}`;
          }
        }
      }
    } catch (error) {
      // Unsupported volumes and unavailable system tools keep the strict device identity.
      if (
        !(error instanceof ProcessSpawnError) &&
        !["ENOENT", "ENOTDIR", "EACCES", "EPERM", "ENODEV", "EIO"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error;
    }

    // Windows already reports a volume serial number rather than a POSIX mount device number.
    return String(device);
  }

  private async run(executable: string, args: string[]): Promise<string | undefined> {
    const result = await this.runner.run({
      executable,
      args,
      env: { LANG: "C", LC_ALL: "C" },
      signal: AbortSignal.timeout(3000),
      maxStdoutBytes: 64 * 1024,
      maxStderrBytes: 8 * 1024,
    });
    if (result.exitCode !== 0 || result.cancelled || result.outputLimitExceeded) return undefined;
    return result.stdout.toString("utf8");
  }
}
