import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fixtureEnvironment } from "../helpers/fixture-environment.ts";

test("fixture commits ignore inherited identities, injected Git config and credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "eda-fixture-isolation-"));
  try {
    const inherited = join(root, "inherited-config");
    await writeFile(inherited, "[user]\nname = Outside Author\nemail = outside@example.test\n");
    const env = fixtureEnvironment(root, {
      ...process.env,
      GIT_AUTHOR_NAME: "Outside Author",
      GIT_AUTHOR_EMAIL: "outside@example.test",
      GIT_COMMITTER_NAME: "Outside Committer",
      GIT_COMMITTER_EMAIL: "committer@example.test",
      EMAIL: "fallback@example.test",
      GIT_CONFIG_GLOBAL: inherited,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "user.email",
      GIT_CONFIG_VALUE_0: "injected@example.test",
      SSH_AUTH_SOCK: "/outside/agent",
      GNUPGHOME: "/outside/gnupg",
      GH_TOKEN: "fixture-token",
    });
    assert.equal(env["GH_TOKEN"], undefined);
    assert.equal(env["SSH_AUTH_SOCK"], "");
    assert.equal(env["GNUPGHOME"], join(root, "gnupg"));
    assert.equal(env["GIT_CONFIG_KEY_0"], undefined);
    await writeFile(
      env["GIT_CONFIG_GLOBAL"]!,
      "[user]\nname = Fixture Author\nemail = fixture@example.test\n[commit]\ngpgsign = false\n",
    );
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", root, ...args], { env, encoding: "utf8", stdio: "pipe" });
    git("init", "-b", "main");
    git("commit", "--allow-empty", "-m", "Synthetic commit");
    assert.equal(
      git("log", "-1", "--format=%an <%ae>%n%cn <%ce>").trim(),
      "Fixture Author <fixture@example.test>\nFixture Author <fixture@example.test>",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
