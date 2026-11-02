import { afterEach, expect, it } from "vitest";
import { access, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertSafeRebaseState } from "@main/git/security/rebase-state";
import { createTempRepo, type TempRepo } from "../../helpers/temp-repo";

let repo: TempRepo;
afterEach(async () => {
  await repo?.cleanup();
});

it("refuses saved shell instructions even when Git's sequence editor is disabled", async () => {
  repo = await createTempRepo();
  await repo.writeFile("a.txt", "a\n");
  await repo.commit("base");
  const base = (await repo.run(["rev-parse", "HEAD"])).trim();
  await repo.writeFile("b.txt", "b\n");
  await repo.commit("topic");
  await repo.git.exec(["rebase", "--interactive", base], {
    cwd: repo.path,
    operation: "pause rebase",
    env: { overrides: { GIT_SEQUENCE_EDITOR: "sed -i.bak '1s/^pick/edit/'", GIT_EDITOR: "true" } },
  });
  const todo = join(repo.path, ".git/rebase-merge/git-rebase-todo");
  const marker = join(repo.home, "executed");
  for (const instruction of ["exec", "x", "merge", "update-ref"]) {
    await writeFile(todo, `${instruction} touch '${marker}'\n`);
    await expect(assertSafeRebaseState(repo.git, repo.path)).rejects.toMatchObject({
      kind: "invalid-input",
    });
    await expect(access(marker)).rejects.toThrow();
  }
  await writeFile(
    todo,
    `# reviewed plan\npick ${base} message containing exec text\nfixup -c ${base} message\nbreak\n`,
  );
  await expect(assertSafeRebaseState(repo.git, repo.path)).resolves.toBeUndefined();
  if (process.platform !== "win32") {
    const metadata = join(repo.home, "metadata ");
    await writeFile(todo, `exec touch '${marker}'\n`);
    await rename(join(repo.path, ".git"), metadata);
    await writeFile(join(repo.path, ".git"), `gitdir: ${metadata}\n`);
    await expect(assertSafeRebaseState(repo.git, repo.path)).rejects.toMatchObject({
      kind: "invalid-input",
    });
  }
});
