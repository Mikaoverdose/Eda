import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  bundledGitBinary,
  bundledGitEnvironment,
  bundledGitLocation,
} from "@main/git/execution/bundled-git";

describe("bundled Git layout", () => {
  it("keeps executable resources outside app.asar and resolves development bundles", () => {
    expect(bundledGitLocation(true, "/app/app.asar", "/app/resources", "win32", "x64")).toBe(
      join("/app/resources", "git"),
    );
    expect(bundledGitLocation(false, "/project", "/unused", "darwin", "arm64")).toBe(
      join("/project", "vendor/git/mac-arm64"),
    );
    expect(bundledGitBinary("/git", "win32")).toBe(join("/git", "cmd/git.exe"));
    expect(bundledGitBinary("/git", "linux")).toBe(join("/git", "bin/git"));
  });

  it("supplies Windows Git, shell, SSH and helper paths ahead of system tools", () => {
    const env = bundledGitEnvironment(
      "/git",
      { Path: "system-tools", UNRELATED_SECRET: "secret" },
      "win32",
      "x64",
    );

    expect(env["PATH"]).toBe(
      [
        join("/git", "cmd"),
        join("/git", "ucrt64/bin"),
        join("/git", "usr/bin"),
        "system-tools",
      ].join(";"),
    );
    expect(env["GIT_EXEC_PATH"]).toBe(join("/git", "ucrt64/libexec/git-core"));
    expect(env["UNRELATED_SECRET"]).toBeUndefined();
  });

  it("uses the ARM64 Windows runtime and Linux relocation resources", () => {
    expect(bundledGitEnvironment("/git", {}, "win32", "arm64")["GIT_EXEC_PATH"]).toBe(
      join("/git", "clangarm64/libexec/git-core"),
    );

    const env = bundledGitEnvironment("/git", {}, "linux", "x64");

    expect(env["PREFIX"]).toBe("/git");
    expect(env["GIT_TEMPLATE_DIR"]).toBe(join("/git", "share/git-core/templates"));
    expect(env["GIT_SSL_CAINFO"]).toBe(join("/git", "ssl/cacert.pem"));
  });

  it("preserves explicitly isolated system config and custom trust stores", () => {
    const env = bundledGitEnvironment(
      "/git",
      { GIT_CONFIG_SYSTEM: "/isolated", GIT_SSL_CAINFO: "/trust.pem" },
      "linux",
      "x64",
    );

    expect(env["GIT_CONFIG_SYSTEM"]).toBeUndefined();
    expect(env["GIT_SSL_CAINFO"]).toBe("/trust.pem");
  });
});
