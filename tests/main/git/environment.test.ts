import { describe, expect, it } from "vitest";
import { delimiter } from "node:path";
import { buildGitEnvironment, buildSshCommand } from "@main/git/execution/environment";

const searchPath = process.platform === "win32" ? "C:\\Windows\\System32" : "/usr/bin";
const source = {
  PATH: searchPath,
  HOME: "/home/dev",
  SSH_AUTH_SOCK: "/run/agent.sock",
  GIT_AUTHOR_NAME: "Leaked Author",
  GIT_COMMITTER_EMAIL: "leaked@example.com",
  GIT_SSH_COMMAND: "ssh -i /other/key",
  EDITOR: "vim",
  AWS_SECRET_ACCESS_KEY: "super-secret",
  LC_ALL: "en_US.UTF-8",
};

describe("buildGitEnvironment", () => {
  it("passes through only the allow-listed variables", () => {
    const env = buildGitEnvironment({}, source);
    expect(env["PATH"]).toBe(searchPath);
    expect(env["HOME"]).toBe("/home/dev");
    expect(env["SSH_AUTH_SOCK"]).toBe("/run/agent.sock");
  });

  it.each(["source", "overrides"] as const)("removes relative PATH entries from %s", (input) => {
    const path = ["", ".", "relative", searchPath].join(delimiter);
    const env =
      input === "source"
        ? buildGitEnvironment({}, { ...source, PATH: path })
        : buildGitEnvironment({ overrides: { PATH: path } }, source);
    expect(env["PATH"]).toBe(searchPath);
  });

  it("retains the machine data root required by Windows OpenSSH signing", () => {
    expect(
      buildGitEnvironment({}, { ProgramData: "C:\\ProgramData", UNRELATED_TOKEN: "secret" }),
    ).toMatchObject({ ProgramData: "C:\\ProgramData" });
  });

  it("drops unrelated variables rather than inheriting the whole environment", () => {
    const env = buildGitEnvironment({}, source);
    expect(env["EDITOR"]).toBeUndefined();
    expect(env["AWS_SECRET_ACCESS_KEY"]).toBeUndefined();
  });

  it("never lets an inherited GIT_SSH_COMMAND select a different key", () => {
    const env = buildGitEnvironment({}, source);
    expect(env["GIT_SSH_COMMAND"]).toBeUndefined();
  });

  it("disables the terminal prompt so Git cannot block forever on credentials", () => {
    expect(buildGitEnvironment({}, source)["GIT_TERMINAL_PROMPT"]).toBe("0");
  });

  it("forces the C locale, which keeps stderr parseable across machines", () => {
    const env = buildGitEnvironment({}, source);
    expect(env["LC_ALL"]).toBe("C");
    expect(env["LANG"]).toBe("C");
  });

  it("strips inherited author and committer identity, so only config decides attribution", () => {
    const env = buildGitEnvironment({}, source);

    for (const key of [
      "GIT_AUTHOR_NAME",
      "GIT_AUTHOR_EMAIL",
      "GIT_COMMITTER_NAME",
      "GIT_COMMITTER_EMAIL",
    ]) {
      expect(env[key]).toBeUndefined();
    }
  });

  it("pins the identity key with IdentitiesOnly so the agent cannot answer as someone else", () => {
    const env = buildGitEnvironment({ sshKeyPath: "/home/dev/.ssh/id_work" }, source);
    expect(env["GIT_SSH_COMMAND"]).toContain("IdentitiesOnly=yes");
    expect(env["GIT_SSH_COMMAND"]).toContain("/home/dev/.ssh/id_work");
  });

  it("isolates config when asked, so a test can never read the real gitconfig", () => {
    const env = buildGitEnvironment({ configScope: "none" }, source);
    expect(env["GIT_CONFIG_GLOBAL"]).toBe("/dev/null");
    expect(env["GIT_CONFIG_SYSTEM"]).toBe("/dev/null");
  });

  it("leaves config alone by default", () => {
    const env = buildGitEnvironment({}, source);
    expect(env["GIT_CONFIG_GLOBAL"]).toBeUndefined();
    expect(env["GIT_CONFIG_SYSTEM"]).toBeUndefined();
  });

  it("honors explicitly selected config files while isolation takes precedence", () => {
    const configured = {
      ...source,
      GIT_CONFIG_GLOBAL: "/custom/gitconfig",
      GIT_CONFIG_SYSTEM: "/custom/system",
      GIT_CONFIG_NOSYSTEM: "1",
    };

    expect(buildGitEnvironment({}, configured)["GIT_CONFIG_GLOBAL"]).toBe("/custom/gitconfig");
    expect(buildGitEnvironment({ configScope: "none" }, configured)["GIT_CONFIG_GLOBAL"]).toBe(
      "/dev/null",
    );
  });

  it("sets DISPLAY alongside SSH_ASKPASS, which OpenSSH requires to use the helper", () => {
    const env = buildGitEnvironment({ askpassPath: "/tmp/askpass.sh" }, { PATH: searchPath });
    expect(env["SSH_ASKPASS"]).toBe("/tmp/askpass.sh");
    expect(env["SSH_ASKPASS_REQUIRE"]).toBe("force");
    expect(env["DISPLAY"]).toBe(":0");
  });

  it("keeps an existing DISPLAY rather than overriding the user session", () => {
    const env = buildGitEnvironment(
      { askpassPath: "/tmp/askpass.sh" },
      { ...source, DISPLAY: ":1" },
    );
    expect(env["DISPLAY"]).toBe(":1");
  });

  it("never requires an askpass helper when none was supplied", () => {
    expect(buildGitEnvironment({}, source)["SSH_ASKPASS_REQUIRE"]).toBe("never");
  });

  it("applies explicit overrides last", () => {
    const env = buildGitEnvironment({ overrides: { HOME: "/tmp/hermetic" } }, source);
    expect(env["HOME"]).toBe("/tmp/hermetic");
  });

  it("omits allow-listed keys that are absent from the source", () => {
    const env = buildGitEnvironment({}, { PATH: searchPath });
    expect("HOME" in env).toBe(false);
  });
});

describe("buildSshCommand", () => {
  it("quotes the key path so a space cannot split it into two arguments", () => {
    expect(buildSshCommand("/home/my keys/id_ed25519")).toContain('"/home/my keys/id_ed25519"');
  });

  it("escapes characters that the shell-like parser would otherwise expand", () => {
    const command = buildSshCommand("/home/dev/$(touch /tmp/pwn)/key");
    expect(command).toContain("\\$");
    expect(command).not.toMatch(/[^\\]\$\(/);
  });

  it("escapes an embedded quote so the argument cannot be closed early", () => {
    const command = buildSshCommand('/home/dev/ev"il/key');
    expect(command).toContain('\\"');
  });

  it("always pins IdentitiesOnly", () => {
    expect(buildSshCommand("/k")).toContain("IdentitiesOnly=yes");
  });
});
