import { afterEach, expect, it } from "vitest";
import { access, chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  absoluteSearchPath,
  executableCandidates,
  resolveExecutable,
} from "@main/git/execution/executable";
import { NodeProcessRunner } from "@main/git/execution/node-process-runner";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

it("never considers the Windows working directory, relative PATH entries or batch files", () => {
  expect(
    executableCandidates("git", { PATH: '.;relative;C:\\tools;"D:\\Git\\bin"' }, "win32"),
  ).toEqual([
    "C:\\tools\\git.exe",
    "C:\\tools\\git.com",
    "D:\\Git\\bin\\git.exe",
    "D:\\Git\\bin\\git.com",
  ]);
  expect(executableCandidates(".\\git.exe", {}, "win32")).toEqual([]);
  expect(executableCandidates("\\git.exe", {}, "win32")).toEqual([]);
  expect(absoluteSearchPath("\\tools;C:tools;C:\\tools", "win32")).toBe("C:\\tools");
  expect(absoluteSearchPath(":.:./bin:/usr/bin:/bin", "linux")).toBe("/usr/bin:/bin");
});

it("resolves the real Git before spawning from an untrusted working directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eda-executable-"));
  directories.push(directory);
  const marker = join(directory, "executed");
  const fake = join(directory, process.platform === "win32" ? "git.exe" : "git");
  await writeFile(fake, `#!/bin/sh\ntouch '${marker}'\n`);
  await chmod(fake, 0o700);
  const git = await resolveExecutable("git", { PATH: process.env["PATH"] ?? "" });
  const result = await new NodeProcessRunner().run({
    executable: "git",
    args: ["--version"],
    cwd: directory,
    env: { PATH: `.${process.platform === "win32" ? ";" : ":"}${dirname(git)}` },
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toMatch(/^git version /);
  await expect(access(marker)).rejects.toThrow();
});
