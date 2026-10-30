import { mkdir, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readImagePreview, MAX_IMAGE_BYTES } from "@main/repo/working-tree/image-preview";
import { createTempRepo } from "../../../helpers/temp-repo";
import { tinyPng, pngVersion } from "../../../fixtures/images";

it("reads independent working, index and immutable commit images through additions, renames and deletions without changing Git state", async () => {
  const repo = await createTempRepo();
  const path = "image [literal].png";
  const request = { repositoryId: "repo", path };
  const data = (bytes: Buffer) => `data:image/png;base64,${bytes.toString("base64")}`;

  try {
    await writeFile(join(repo.path, path), tinyPng);
    expect(
      await readImagePreview(repo.git, repo.path, { ...request, kind: "working" }),
    ).toMatchObject({
      before: { kind: "missing" },
      after: { kind: "image", dataUrl: data(tinyPng) },
    });

    await repo.run(["add", "--", path]);
    expect(
      await readImagePreview(repo.git, repo.path, { ...request, kind: "staged" }),
    ).toMatchObject({
      before: { kind: "missing" },
      after: { kind: "image", dataUrl: data(tinyPng) },
    });

    await repo.commit("Original image");

    const original = (await repo.run(["rev-parse", "HEAD"])).trim();

    await writeFile(join(repo.path, path), pngVersion("index"));
    await repo.run(["add", "--", path]);
    await writeFile(join(repo.path, path), pngVersion("working"));

    const snapshot = async () => ({
      head: await repo.run(["rev-parse", "HEAD"]),
      index: await repo.run(["write-tree"]),
      status: await repo.run(["status", "--porcelain"]),
      refs: await repo.run(["show-ref"]),
    });

    const before = await snapshot();

    expect(
      await readImagePreview(repo.git, repo.path, { ...request, kind: "working" }),
    ).toMatchObject({
      before: { dataUrl: data(pngVersion("index")) },
      after: { dataUrl: data(pngVersion("working")) },
    });
    expect(
      await readImagePreview(repo.git, repo.path, { ...request, kind: "staged" }),
    ).toMatchObject({
      before: { dataUrl: data(tinyPng) },
      after: { dataUrl: data(pngVersion("index")) },
    });
    expect(
      await readImagePreview(repo.git, repo.path, { ...request, kind: "commit", oid: original }),
    ).toMatchObject({ before: { kind: "missing" }, after: { dataUrl: data(tinyPng) } });
    expect(await snapshot()).toEqual(before);

    await repo.run(["commit", "-m", "Staged image"]);

    const staged = (await repo.run(["rev-parse", "HEAD"])).trim();

    expect(
      await readImagePreview(repo.git, repo.path, { ...request, kind: "commit", oid: staged }),
    ).toMatchObject({
      before: { dataUrl: data(tinyPng) },
      after: { dataUrl: data(pngVersion("index")) },
    });

    await rename(join(repo.path, path), join(repo.path, "renamed.png"));
    await repo.commit("Rename image");

    const renamed = (await repo.run(["rev-parse", "HEAD"])).trim();

    expect(
      await readImagePreview(repo.git, repo.path, {
        repositoryId: "repo",
        path: "renamed.png",
        oldPath: path,
        kind: "commit",
        oid: renamed,
      }),
    ).toMatchObject({
      before: { dataUrl: data(pngVersion("index")) },
      after: { dataUrl: data(pngVersion("working")) },
    });

    await unlink(join(repo.path, "renamed.png"));
    expect(
      await readImagePreview(repo.git, repo.path, {
        repositoryId: "repo",
        path: "renamed.png",
        kind: "working",
      }),
    ).toMatchObject({ before: { kind: "image" }, after: { kind: "missing" } });
  } finally {
    await repo.cleanup();
  }
});

it("bounds binary reads, identifies LFS pointers and refuses metadata, traversal and linked working files", async () => {
  const repo = await createTempRepo();
  const request = { repositoryId: "repo", kind: "working" as const };

  try {
    await writeFile(
      join(repo.path, "pointer.png"),
      "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 100\n",
    );
    await writeFile(join(repo.path, "large.png"), Buffer.alloc(MAX_IMAGE_BYTES + 1));
    await writeFile(join(repo.path, "unsupported.png"), "not an image");
    await repo.commit("Binary boundaries");

    const oid = (await repo.run(["rev-parse", "HEAD"])).trim();

    expect(
      (await readImagePreview(repo.git, repo.path, { ...request, path: "pointer.png" })).after,
    ).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("LFS pointer") });
    expect(
      (await readImagePreview(repo.git, repo.path, { ...request, path: "large.png" })).after,
    ).toMatchObject({ kind: "unavailable", bytes: MAX_IMAGE_BYTES + 1 });
    expect(
      (
        await readImagePreview(repo.git, repo.path, {
          ...request,
          path: "large.png",
          kind: "commit",
          oid,
        })
      ).after,
    ).toMatchObject({ kind: "unavailable", bytes: MAX_IMAGE_BYTES + 1 });
    expect(
      (await readImagePreview(repo.git, repo.path, { ...request, path: "unsupported.png" })).after,
    ).toMatchObject({ kind: "unavailable" });

    for (const path of ["../outside.png", ".git/config", "/outside.png"])
      await expect(
        readImagePreview(repo.git, repo.path, { ...request, path }),
      ).rejects.toMatchObject({ kind: "invalid-input" });

    await expect(
      readImagePreview(repo.git, repo.path, {
        ...request,
        path: "pointer.png",
        kind: "commit",
        oid: "--all",
      }),
    ).rejects.toMatchObject({ kind: "invalid-input" });

    if (process.platform !== "win32") {
      await writeFile(join(repo.home, "outside.png"), tinyPng);
      await symlink(join(repo.home, "outside.png"), join(repo.path, "linked.png"));
      await mkdir(join(repo.home, "images"));
      await writeFile(join(repo.home, "images", "outside.png"), tinyPng);
      await symlink(join(repo.home, "images"), join(repo.path, "linked"));

      for (const path of ["linked.png", "linked/outside.png"])
        expect(
          (await readImagePreview(repo.git, repo.path, { ...request, path })).after,
        ).toMatchObject({ kind: "unavailable" });
    }
  } finally {
    await repo.cleanup();
  }
});
