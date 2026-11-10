import { detectInstallation } from "@main/application/installation";
import { ProcessSpawnError } from "@main/git/execution/process-runner";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeProcessRunner } from "../../helpers/fake-process-runner";

let root: string;
let bundle: string;
let executablePath: string;
let resourcesPath: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "eda-installation-"));
  bundle = join(root, "Applications", "Eda.app");
  resourcesPath = join(bundle, "Contents", "Resources");
  executablePath = join(bundle, "Contents", "MacOS", "Eda");
  await mkdir(resourcesPath, { recursive: true });
  await mkdir(join(bundle, "Contents", "MacOS"));
  await writeFile(executablePath, "fixture executable");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const options = () => ({
  packaged: true,
  platform: "darwin" as const,
  executablePath,
  resourcesPath,
  environment: { PATH: "", HOMEBREW_CASKROOM: join(root, "brew", "Caskroom") },
});

async function caskLink(target: string) {
  const version = join(root, "brew", "Caskroom", "eda", "0.0.3");
  await mkdir(version, { recursive: true });
  await symlink(
    target,
    join(version, "Eda.app"),
    process.platform === "win32" ? "junction" : "dir",
  );
}

it("identifies development builds without probing package tools or requiring installed paths", async () => {
  const runner = new FakeProcessRunner();
  expect(
    await detectInstallation(
      {
        ...options(),
        packaged: false,
        executablePath: join(root, "missing"),
        resourcesPath: join(root, "missing"),
      },
      runner,
    ),
  ).toEqual({ method: "development" });
  expect(runner.calls).toHaveLength(0);
});

it.each(["caskroom", "prefix", "path"] as const)(
  "matches the running app through a Homebrew %s record",
  async (source) => {
    await caskLink(bundle);
    const environment =
      source === "caskroom"
        ? options().environment
        : source === "prefix"
          ? { PATH: "", HOMEBREW_PREFIX: join(root, "brew") }
          : { PATH: join(root, "brew", "bin") };

    expect(await detectInstallation({ ...options(), environment })).toEqual({
      method: "homebrew",
      executable: join(root, "brew", "bin", "brew"),
    });
    expect(await readFile(executablePath, "utf8")).toBe("fixture executable");
  },
);

it("keeps a separate direct copy distinct from the Homebrew-managed app", async () => {
  const other = join(root, "Other", "Eda.app");
  await mkdir(other, { recursive: true });
  await caskLink(other);

  expect(await detectInstallation(options())).toEqual({ method: "direct" });
  await rm(other, { recursive: true });
  expect(await detectInstallation(options())).toEqual({ method: "direct" });
});

it("reports unknown when the running app cannot be inspected", async () => {
  expect(
    await detectInstallation({
      ...options(),
      resourcesPath: join(root, "missing", "Contents", "Resources"),
    }),
  ).toEqual({ method: "unknown" });
});

it.each([
  ["dpkg", "dpkg-query"],
  ["rpm", "rpm"],
  ["pacman", "pacman"],
] as const)(
  "identifies Linux packages by actual %s ownership of the executable",
  async (manager, executable) => {
    const path = await realpath(executablePath);
    const runner = new FakeProcessRunner()
      .when((request) => request.executable === executable, {
        stdout: manager === "dpkg" ? `eda: ${path}\n` : "eda\n",
      })
      .otherwise({ exitCode: 1 });

    expect(await detectInstallation({ ...options(), platform: "linux" }, runner)).toEqual({
      method: "system-package",
      manager,
    });
    expect(runner.calls.every((request) => request.args.includes(path))).toBe(true);
    expect(await readFile(executablePath, "utf8")).toBe("fixture executable");
  },
);

it("does not treat installed package tools as ownership of a direct download", async () => {
  const runner = new FakeProcessRunner().otherwise({ exitCode: 1 });
  expect(await detectInstallation({ ...options(), platform: "linux" }, runner)).toEqual({
    method: "direct",
  });

  const missing = {
    run: async () => {
      throw new ProcessSpawnError(
        "missing",
        Object.assign(new Error("missing"), { code: "ENOENT" }),
      );
    },
  };
  expect(await detectInstallation({ ...options(), platform: "linux" }, missing)).toEqual({
    method: "direct",
  });
});

it.each([
  { cancelled: true },
  { exitCode: 2 },
  { outputLimitExceeded: "stdout" as const },
  { stdout: "unexpected result" },
])("leaves failed or incomplete package detection unknown: %j", async (failure) => {
  const runner = new FakeProcessRunner().otherwise(failure);
  expect(await detectInstallation({ ...options(), platform: "linux" }, runner)).toEqual({
    method: "unknown",
  });
});
