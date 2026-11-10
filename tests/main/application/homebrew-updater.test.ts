import { HomebrewUpdater } from "@main/application/homebrew-updater";
import { FakeProcessRunner } from "../../helpers/fake-process-runner";

const cask = {
  full_token: "yuzuzensai/tap/eda",
  version: "0.0.2",
  installed: "0.0.1",
  outdated: true,
  pinned: false,
  disabled: false,
  sha256: "a".repeat(64),
};

function fixture(changes: Record<string, unknown> = {}) {
  const runner = new FakeProcessRunner()
    .on(["update"], {})
    .on(["info"], { stdout: JSON.stringify({ casks: [{ ...cask, ...changes }] }) })
    .on(["upgrade"], {});
  const restart = vi.fn();
  const updater = new HomebrewUpdater(
    runner,
    "/opt/homebrew/bin/brew",
    "/tmp/neutral-directory",
    "0.0.1",
    restart,
    { PATH: "/usr/bin:/bin", HOME: "/Users/fixture" },
  );

  return { updater, runner, restart };
}

it("refreshes the tap and allows only the announced release from the installed Eda cask", async () => {
  const { updater, runner } = fixture();

  expect(await updater.check("0.0.2")).toBeNull();
  expect(runner.calls.map((call) => call.args[0])).toEqual(["update", "info"]);
  expect(runner.calls.every((call) => call.executable === "/opt/homebrew/bin/brew")).toBe(true);
  expect(runner.calls.every((call) => call.cwd === "/tmp/neutral-directory")).toBe(true);
  expect(
    runner.calls.every((call) => call.signal && call.maxStdoutBytes && call.maxStderrBytes),
  ).toBe(true);
  expect(runner.lastCall?.env).toMatchObject({
    HOME: "/Users/fixture",
    NONINTERACTIVE: "1",
    HOMEBREW_NO_AUTO_UPDATE: "1",
    HOMEBREW_NO_INSTALL_CLEANUP: "1",
    HOMEBREW_NO_SUDO: "1",
  });
});

it.each([
  { version: "0.0.1" },
  { version: "0.0.3" },
  { version: "latest" },
  { installed: null },
  { installed: "0.0.2" },
  { outdated: false },
  { disabled: true },
  { sha256: "no_check" },
])("blocks an unavailable or unsuitable cask: %j", async (changes) => {
  const { updater, runner } = fixture(changes);

  expect(await updater.check("0.0.2")).toMatch(/not available through Homebrew yet/);
  await expect(updater.install("0.0.2")).rejects.toThrow(/not available through Homebrew yet/);
  expect(runner.calls.some((call) => call.args[0] === "upgrade")).toBe(false);
});

it("respects pinned casks", async () => {
  const { updater, runner } = fixture({ pinned: true });

  expect(await updater.check("0.0.2")).toMatch(/pinned/);
  await expect(updater.install("0.0.2")).rejects.toThrow(/pinned/);
  expect(runner.calls.some((call) => call.args[0] === "upgrade")).toBe(false);
});

it.each([
  "invalid JSON",
  JSON.stringify({ casks: [] }),
  JSON.stringify({ casks: [cask, cask] }),
  JSON.stringify({ casks: [{ ...cask, full_token: "someone/else/eda" }] }),
])("rejects unverified cask information: %s", async (stdout) => {
  const runner = new FakeProcessRunner().on(["update"], {}).on(["info"], { stdout });
  const updater = new HomebrewUpdater(runner, "/brew", "/tmp", "0.0.1", vi.fn());

  await expect(updater.install("0.0.2")).rejects.toThrow(/Homebrew could not complete/);
  expect(runner.calls.some((call) => call.args[0] === "upgrade")).toBe(false);
});

it.each([{ exitCode: 1 }, { cancelled: true }, { outputLimitExceeded: "stdout" as const }])(
  "blocks upgrades when refreshing Homebrew fails: %j",
  async (failure) => {
    const runner = new FakeProcessRunner().on(["update"], failure);
    const updater = new HomebrewUpdater(runner, "/brew", "/tmp", "0.0.1", vi.fn());

    await expect(updater.check("0.0.2")).rejects.toThrow(/Homebrew could not complete/);
    expect(runner.calls).toHaveLength(1);
  },
);

it("rechecks a previously offered cask and refuses it if the tap changes before installation", async () => {
  const { updater, runner } = fixture();
  expect(await updater.check("0.0.2")).toBeNull();
  const run = runner.run.bind(runner);
  vi.spyOn(runner, "run").mockImplementation(async (request) => {
    const result = await run(request);
    if (request.args[0] === "info")
      result.stdout = Buffer.from(JSON.stringify({ casks: [{ ...cask, version: "0.0.3" }] }));
    return result;
  });

  await expect(updater.install("0.0.2")).rejects.toThrow(/not available through Homebrew yet/);
  expect(runner.calls.some((call) => call.args[0] === "upgrade")).toBe(false);
});

it("upgrades only Eda without quitting the app and verifies the installed version before returning", async () => {
  const { updater, runner } = fixture();
  const run = runner.run.bind(runner);
  let upgraded = false;
  vi.spyOn(runner, "run").mockImplementation(async (request) => {
    const result = await run(request);
    if (request.args[0] === "upgrade") upgraded = true;
    if (request.args[0] === "info" && upgraded)
      result.stdout = Buffer.from(JSON.stringify({ casks: [{ ...cask, installed: "0.0.2" }] }));
    return result;
  });

  await updater.install("0.0.2");

  expect(upgraded).toBe(true);
  expect(runner.calls.find((call) => call.args[0] === "upgrade")?.args).toEqual([
    "upgrade",
    "--cask",
    "--no-quit",
    "--require-sha",
    "yuzuzensai/tap/eda",
  ]);
  expect(runner.lastCall?.args[0]).toBe("info");
});

it("does not claim success when Homebrew exits successfully without installing the target version", async () => {
  const { updater } = fixture();

  await expect(updater.install("0.0.2")).rejects.toThrow(/Homebrew could not complete/);
});
