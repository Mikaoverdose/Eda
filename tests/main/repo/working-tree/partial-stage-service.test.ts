import { afterEach, describe, expect, it } from "vitest";
import { createTempRepo, type TempRepo } from "../../../helpers/temp-repo";
import { PartialStageService } from "@main/repo/working-tree/partial-stage-service";

let repo: TempRepo;

afterEach(async () => {
  if (repo) await repo.cleanup();
});

describe("partial index writes", () => {
  it.each(["one\r\ntwo\r\n", "one\ntwo"])(
    "preserves CRLF and missing final newlines: %j",
    async (original) => {
      repo = await createTempRepo();
      await repo.run(["config", "core.autocrlf", "false"]);
      await repo.writeFile("file.txt", original);
      await repo.commit("initial");

      const changed = original.replace("two", "changed");

      await repo.writeFile("file.txt", changed);

      const partial = new PartialStageService(repo.git);
      const preview = await partial.preview(repo.path, "work", {
        repositoryId: "r",
        path: "file.txt",
        area: "unstaged",
        hunks: [0],
      });

      await partial.apply(repo.path, "work", "r", preview.token);
      expect(await repo.run(["show", ":file.txt"])).toBe(changed);

      const reverse = await partial.preview(repo.path, "work", {
        repositoryId: "r",
        path: "file.txt",
        area: "staged",
        hunks: [0],
      });

      await partial.apply(repo.path, "work", "r", reverse.token);
      expect(await repo.run(["show", ":file.txt"])).toBe(original);
    },
  );

  it("stages one of two hunks, commits it, and leaves the other change in the worktree", async () => {
    repo = await createTempRepo();

    const original = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n") + "\n";

    await repo.writeFile("file.txt", original);
    await repo.commit("initial");
    await repo.writeFile(
      "file.txt",
      original.replace("line 1\n", "first change\n").replace("line 25\n", "second change\n"),
    );

    const partial = new PartialStageService(repo.git);
    const preview = await partial.preview(repo.path, "work", {
      repositoryId: "r",
      path: "file.txt",
      area: "unstaged",
      hunks: [0],
    });

    expect(preview.patch).not.toContain("second change");

    await partial.apply(repo.path, "work", "r", preview.token);
    await repo.run(["commit", "-m", "first hunk"]);
    expect(await repo.run(["show", "HEAD:file.txt"])).toContain("first change");
    expect(await repo.run(["show", "HEAD:file.txt"])).not.toContain("second change");
    expect(await repo.run(["diff"])).toContain("second change");
  });

  it("stages selected lines and unstages a replacement without altering the worktree", async () => {
    repo = await createTempRepo();
    await repo.writeFile("file.txt", "old\nkeep\n");
    await repo.commit("initial");
    await repo.writeFile("file.txt", "new\nkeep\nextra\n");

    const partial = new PartialStageService(repo.git);
    let preview = await partial.preview(repo.path, "work", {
      repositoryId: "r",
      path: "file.txt",
      area: "unstaged",
      lines: [
        { hunk: 0, line: 0 },
        { hunk: 0, line: 1 },
      ],
    });

    await partial.apply(repo.path, "work", "r", preview.token);
    expect(await repo.run(["show", ":file.txt"])).toBe("new\nkeep\n");

    preview = await partial.preview(repo.path, "work", {
      repositoryId: "r",
      path: "file.txt",
      area: "staged",
      hunks: [0],
    });
    await partial.apply(repo.path, "work", "r", preview.token);
    expect(await repo.run(["show", ":file.txt"])).toBe("old\nkeep\n");
    expect(await repo.run(["diff"])).toContain("+extra");
  });

  it("rejects stale previews and a different profile without applying any index change", async () => {
    repo = await createTempRepo();
    await repo.writeFile("file.txt", "old\n");
    await repo.commit("initial");
    await repo.writeFile("file.txt", "new\n");

    const partial = new PartialStageService(repo.git);
    const preview = await partial.preview(repo.path, "work", {
      repositoryId: "r",
      path: "file.txt",
      area: "unstaged",
      hunks: [0],
    });

    await expect(partial.apply(repo.path, "other", "r", preview.token)).rejects.toThrow();

    await repo.writeFile("file.txt", "changed again\n");
    await expect(partial.apply(repo.path, "work", "r", preview.token)).rejects.toThrow(
      "changed after",
    );
    expect(await repo.run(["diff", "--cached"])).toBe("");
  });

  it("supports new UTF-8 files and partial unstaging without dropping remaining lines", async () => {
    repo = await createTempRepo();
    await repo.writeFile("日本語 file.txt", "one\ntwo\n");

    const partial = new PartialStageService(repo.git);
    let preview = await partial.preview(repo.path, "work", {
      repositoryId: "r",
      path: "日本語 file.txt",
      area: "unstaged",
      lines: [{ hunk: 0, line: 0 }],
    });

    await partial.apply(repo.path, "work", "r", preview.token);
    expect(await repo.run(["show", ":日本語 file.txt"])).toBe("one\n");

    await repo.run(["add", "."]);
    preview = await partial.preview(repo.path, "work", {
      repositoryId: "r",
      path: "日本語 file.txt",
      area: "staged",
      lines: [{ hunk: 0, line: 0 }],
    });
    await partial.apply(repo.path, "work", "r", preview.token);
    expect(await repo.run(["show", ":日本語 file.txt"])).toBe("two\n");
  });
});
