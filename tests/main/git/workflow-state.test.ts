import { afterEach, expect, it } from "vitest";
import { join } from "node:path";
import { createTempRepo, type TempRepo } from "../../helpers/temp-repo";
import { readWorkflowState } from "@main/git/operations/workflow-state";

let repo: TempRepo | undefined;

afterEach(async () => {
  await repo?.cleanup();
});

it("reconciles native merge and rebase conflicts, staged resolutions and aborts in a linked worktree", async () => {
  repo = await createTempRepo();
  await repo.writeFile("shared.txt", "base\n");
  await repo.commit("base");
  await repo.run(["checkout", "-b", "topic"]);
  await repo.writeFile("shared.txt", "topic\n");
  await repo.commit("topic");

  const topicHead = (await repo.run(["rev-parse", "HEAD"])).trim();

  await repo.run(["checkout", "main"]);
  await repo.writeFile("shared.txt", "main\n");
  await repo.commit("main");

  const linked = join(repo.home, "linked");

  await repo.run(["worktree", "add", linked, "topic"]);

  const inspect = async (root = linked) =>
    readWorkflowState(repo!.git, root, await repo!.git.status(root));

  await repo.git.exec(["merge", "main", "--no-edit"], {
    cwd: linked,
    operation: "fixture merge",
    allowedExitCodes: [0, 1],
  });

  const merge = await inspect();

  expect(merge).toMatchObject({
    kind: "merge",
    head: topicHead,
    originalHead: topicHead,
    conflicts: ["shared.txt"],
  });
  expect(await inspect(repo.path)).toBeNull();
  expect(await inspect()).toEqual(merge);

  await repo.run(["checkout", "--ours", "--", "shared.txt"], linked);
  await repo.run(["add", "shared.txt"], linked);

  const staged = await inspect();

  expect(staged?.kind).toBe("merge");
  expect(staged?.conflicts).toEqual([]);
  expect(staged?.token).not.toBe(merge?.token);

  await repo.run(["merge", "--abort"], linked);
  expect(await inspect()).toBeNull();
  expect((await repo.run(["rev-parse", "HEAD"], linked)).trim()).toBe(topicHead);

  await repo.git.exec(["rebase", "main"], {
    cwd: linked,
    operation: "fixture rebase",
    allowedExitCodes: [0, 1],
  });

  const rebase = await inspect();

  expect(rebase).toMatchObject({
    kind: "rebase",
    originalBranch: "topic",
    rebaseOnto: (await repo.run(["rev-parse", "main"])).trim(),
    originalHead: topicHead,
    conflicts: ["shared.txt"],
    step: 1,
    total: 1,
  });
  expect(rebase?.currentLabel).toContain("Rebased history");
  expect(rebase?.incomingLabel).toContain("Replayed commit");
  expect(rebase?.incoming).toEqual([topicHead]);
  expect(rebase?.instance).toEqual(expect.any(String));
  expect((await inspect())?.instance).toBe(rebase?.instance);
  expect(await repo.run(["show", ":2:shared.txt"], linked)).toBe("main\n");
  expect(await repo.run(["show", ":3:shared.txt"], linked)).toBe("topic\n");

  await repo.run(["rebase", "--abort"], linked);
  expect(await inspect()).toBeNull();
  expect((await repo.run(["rev-parse", "HEAD"], linked)).trim()).toBe(topicHead);

  const mainHead = (await repo.run(["rev-parse", "main"])).trim();

  await repo.git.exec(["rebase", "main"], {
    cwd: linked,
    operation: "fixture repeated rebase",
    allowedExitCodes: [1],
  });

  const repeated = await inspect();

  expect(repeated?.originalHead).toBe(rebase?.originalHead);
  expect(repeated?.instance).not.toBe(rebase?.instance);
  expect(repeated?.token).not.toBe(rebase?.token);

  await repo.run(["checkout", "--ours", "--", "shared.txt"], linked);
  await repo.run(["add", "shared.txt"], linked);
  expect((await inspect())?.instance).toBe(repeated?.instance);

  await repo.run(["rebase", "--abort"], linked);
  await repo.git.exec(["cherry-pick", mainHead], {
    cwd: linked,
    operation: "fixture pick",
    allowedExitCodes: [1],
  });

  const picked = await inspect();

  expect(picked?.kind).toBe("cherry-pick");
  expect(picked?.incoming).toEqual([mainHead]);
  expect(picked?.incomingLabel).toContain("Picked commit");
  expect(await repo.run(["show", ":1:shared.txt"], linked)).toBe("base\n");
  expect(await repo.run(["show", ":2:shared.txt"], linked)).toBe("topic\n");
  expect(await repo.run(["show", ":3:shared.txt"], linked)).toBe("main\n");

  await repo.run(["cherry-pick", "--abort"], linked);
  await repo.git.exec(["revert", "--no-edit", mainHead], {
    cwd: linked,
    operation: "fixture revert",
    allowedExitCodes: [1],
  });

  const reverted = await inspect();

  expect(reverted?.kind).toBe("revert");
  expect(reverted?.incoming).toEqual([mainHead]);
  expect(reverted?.incomingLabel).toContain("State before reverted change");
  expect(await repo.run(["show", ":1:shared.txt"], linked)).toBe("main\n");
  expect(await repo.run(["show", ":2:shared.txt"], linked)).toBe("topic\n");
  expect(await repo.run(["show", ":3:shared.txt"], linked)).toBe("base\n");

  await repo.run(["revert", "--abort"], linked);
  expect(await inspect()).toBeNull();
  expect((await repo.run(["rev-parse", "HEAD"], linked)).trim()).toBe(topicHead);
});
