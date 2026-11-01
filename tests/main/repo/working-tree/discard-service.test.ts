import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createTempRepo, type TempRepo } from "../../../helpers/temp-repo";
import { openInMemoryDatabase } from "@main/persistence/database";
import { IdentityRepository } from "@main/persistence/identity-repository";
import { ContentRecoveryRepository } from "@main/persistence/content-recovery-repository";
import { repositories } from "@main/persistence/schema";
import { DiscardService } from "@main/repo/working-tree/discard-service";

let repo: TempRepo;

afterEach(async () => {
  if (repo) await repo.cleanup();
});

async function setup() {
  repo = await createTempRepo();

  const db = openInMemoryDatabase();
  const profile = new IdentityRepository(db).create({
    name: "Work",
    gitName: "Eda",
    gitEmail: "eda@example.com",
    hue: 210,
    signing: { format: "none", signCommits: false },
    rules: [],
  });

  db.insert(repositories)
    .values({
      id: "r",
      identityId: profile.id,
      name: "Fixture",
      path: repo.path,
      favourite: 0,
      createdAt: "now",
    })
    .run();

  const store = new ContentRecoveryRepository(db);

  return { profileId: profile.id, store, service: new DiscardService(repo.git, store) };
}

it("snapshots tracked and untracked bytes, preserves the index, and restores after service restart", async () => {
  const { service, profileId, store } = await setup();

  await repo.writeFile("file.txt", "base\r\n");
  await repo.commit("initial");
  await repo.writeFile("file.txt", "staged\r\n");
  await repo.run(["add", "file.txt"]);
  await repo.writeFile("file.txt", "worktree\r\n");
  await repo.writeFile("日本語.bin", "binary\0bytes");

  const index = await repo.run(["write-tree"]);
  const preview = await service.preview(repo.path, profileId, "r", ["file.txt", "日本語.bin"]);

  expect(preview).toMatchObject({ tracked: 1, untracked: 1 });

  await service.apply(repo.path, profileId, "r", preview.token);
  expect(await readFile(join(repo.path, "file.txt"), "utf8")).toBe("staged\r\n");
  await expect(readFile(join(repo.path, "日本語.bin"))).rejects.toThrow();
  expect(await repo.run(["write-tree"])).toBe(index);

  await repo.writeFile("file.txt", "worktree\r\n");
  await repo.writeFile("日本語.bin", "newer bytes");
  await expect(
    service.restore(repo.path, profileId, "r", service.list(profileId, "r")[0]!.id),
  ).rejects.toThrow("protect newer work");
  expect(await readFile(join(repo.path, "日本語.bin"), "utf8")).toBe("newer bytes");

  await unlink(join(repo.path, "日本語.bin"));

  const restarted = new DiscardService(repo.git, store);

  await restarted.restore(repo.path, profileId, "r", restarted.list(profileId, "r")[0]!.id);
  expect(await readFile(join(repo.path, "file.txt"), "utf8")).toBe("worktree\r\n");
  expect(await readFile(join(repo.path, "日本語.bin"), "utf8")).toBe("binary\0bytes");
  expect(await repo.run(["write-tree"])).toBe(index);
});

it("refuses stale previews, cross-profile access and restoration over newer work", async () => {
  const { service, profileId } = await setup();

  await repo.writeFile("file.txt", "base");
  await repo.commit("initial");
  await repo.writeFile("file.txt", "first");

  const preview = await service.preview(repo.path, profileId, "r", ["file.txt"]);

  await expect(service.apply(repo.path, "other", "r", preview.token)).rejects.toThrow(
    "another context",
  );

  await repo.writeFile("file.txt", "second");
  await expect(service.apply(repo.path, profileId, "r", preview.token)).rejects.toThrow(
    "changed after",
  );

  const fresh = await service.preview(repo.path, profileId, "r", ["file.txt"]);

  await service.apply(repo.path, profileId, "r", fresh.token);
  await repo.writeFile("file.txt", "new external work");

  const id = service.list(profileId, "r")[0]!.id;

  await expect(service.restore(repo.path, profileId, "r", id)).rejects.toThrow(
    "protect newer work",
  );
  expect(service.list("other", "r")).toEqual([]);
  expect(await readFile(join(repo.path, "file.txt"), "utf8")).toBe("new external work");
});

it("discards one hunk with an exact reverse patch and recovers its original working bytes", async () => {
  const { service, profileId } = await setup();
  const original = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n") + "\n";

  await repo.writeFile("file.txt", original);
  await repo.commit("initial");

  const changed = original.replace("line 1\n", "first\n").replace("line 25\n", "second\n");

  await repo.writeFile("file.txt", changed);

  const preview = await service.previewPartial(repo.path, profileId, {
    repositoryId: "r",
    path: "file.txt",
    area: "unstaged",
    hunks: [0],
  });

  expect(preview.patch).toContain("-first");
  expect(preview.patch).not.toContain("second");

  await service.apply(repo.path, profileId, "r", preview.token);
  expect(await readFile(join(repo.path, "file.txt"), "utf8")).toBe(
    original.replace("line 25\n", "second\n"),
  );
  expect(await repo.run(["diff", "--cached"])).toBe("");

  await service.restore(repo.path, profileId, "r", service.list(profileId, "r")[0]!.id);
  expect(await readFile(join(repo.path, "file.txt"), "utf8")).toBe(changed);
});

it("rejects corrupted saved bytes before restoring any file and preserves the snapshot", async () => {
  const { service, profileId, store } = await setup();
  for (const path of ["first.txt", "second.txt"]) await repo.writeFile(path, "base");
  await repo.commit("initial");
  for (const path of ["first.txt", "second.txt"]) await repo.writeFile(path, "working changes");
  const preview = await service.preview(repo.path, profileId, "r", ["first.txt", "second.txt"]);
  await service.apply(repo.path, profileId, "r", preview.token);
  const id = service.list(profileId, "r")[0]!.id;
  const record = store.get(profileId, "r", id)!;
  record.files[1]!.content = Buffer.from("corrupted content").toString("base64");
  store.save(record);
  await expect(service.restore(repo.path, profileId, "r", id)).rejects.toThrow();
  for (const path of ["first.txt", "second.txt"])
    expect(await readFile(join(repo.path, path), "utf8")).toBe("base");
  expect(store.list(profileId, "r").map((entry) => entry.id)).toContain(id);
});
