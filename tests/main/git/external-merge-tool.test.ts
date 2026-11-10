import { expect, it } from "vitest";
import { lstat, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ExternalMergeTool } from "@main/git/external-merge-tool";
import type { ProcessRunner } from "@main/git/execution/process-runner";

const versions = {
  base: Buffer.from("base"),
  current: Buffer.from("current"),
  incoming: Buffer.from("incoming"),
  result: Buffer.from("result"),
};

for (const kind of ["complete", "oversized", "symlink"] as const) {
  it.skipIf(kind === "symlink" && process.platform === "win32")(
    `reads a ${kind} merge result with the shared bounded file reader and cleans up`,
    async () => {
      let directory = "";
      const content = "résolved\n".repeat(100_000);

      const runner: ProcessRunner = {
        async run(request) {
          directory = request.cwd!;
          const result = join(directory, "result.txt");

          if (kind === "symlink") {
            await unlink(result);
            await symlink(join(directory, "current.txt"), result);
          } else {
            await writeFile(
              result,
              kind === "oversized" ? Buffer.alloc(4 * 1024 * 1024 + 1) : content,
            );
          }

          return {
            exitCode: 0,
            stdout: Buffer.alloc(0),
            stderr: Buffer.alloc(0),
            cancelled: false,
          };
        },
      };

      const running = new ExternalMergeTool(runner).run(
        { executable: process.execPath, args: ["{base}", "{current}", "{incoming}", "{result}"] },
        versions,
      );

      if (kind === "complete") await expect(running).resolves.toBe(content);
      else await expect(running).rejects.toThrow(kind === "oversized" ? /4 MiB/ : /regular result/);

      await expect(lstat(directory)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );
}
