import { afterEach, expect, it, vi } from "vitest";
import { NodeProcessRunner } from "@main/git/execution/node-process-runner";
import { migrateMacosKeychain } from "@main/secrets/migrate-macos-keychain";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function runner(exitCode = 0) {
  return {
    run: vi.fn().mockResolvedValue({
      exitCode,
      stdout: Buffer.alloc(0),
      stderr: Buffer.from("Keychain unavailable"),
      cancelled: false,
    }),
  };
}

it.each([0, 44])(
  "deletes only the lowercase entry and tolerates an absent item (exit %s)",
  async (exitCode) => {
    vi.stubGlobal("process", { platform: "darwin" });
    const processRunner = runner(exitCode);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await migrateMacosKeychain(processRunner);

    expect(processRunner.run).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        executable: "/usr/bin/security",
        args: ["delete-generic-password", "-s", "eda Safe Storage", "-a", "eda"],
      }),
    );
    expect(warn).not.toHaveBeenCalled();
  },
);

it.each(["linux", "win32"])("skips Keychain cleanup on %s", async (platform) => {
  vi.stubGlobal("process", { platform });
  const run = vi.spyOn(NodeProcessRunner.prototype, "run");
  await migrateMacosKeychain();
  expect(run).not.toHaveBeenCalled();
});

it("reports failed cleanup without blocking startup", async () => {
  vi.stubGlobal("process", { platform: "darwin" });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  await expect(migrateMacosKeychain(runner(1))).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    "[Eda Keychain] Could not delete the legacy entry:",
    "Keychain unavailable",
  );
});

it("reports a process failure without blocking startup", async () => {
  vi.stubGlobal("process", { platform: "darwin" });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const processRunner = runner();
  processRunner.run.mockRejectedValueOnce(new Error("Could not start security"));
  await expect(migrateMacosKeychain(processRunner)).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    "[Eda Keychain] Could not delete the legacy entry:",
    "Could not start security",
  );
});
