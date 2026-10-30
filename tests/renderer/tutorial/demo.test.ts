import { createDemo, demoRepositories } from "@renderer/tutorial/demo";
import { welcomeTour } from "@renderer/tutorial/steps";
import { builtInSetting, type ResolvedSetting } from "@shared/preferences/settings";

const id = demoRepositories[0]!.id;
it("retains host appearance when a diff reloads preferences and keeps layout changes in the demo", async () => {
  const demo = createDemo();
  const theme: ResolvedSetting<"theme"> = {
    ...builtInSetting("theme"),
    value: { mode: "dark", light: "light", dark: "dark" },
  };
  const background = {
    ...builtInSetting("background"),
    value: { image: "data:image/png;base64,AQID", strength: 75, blur: 4 },
  };
  const preferences = { theme, background, diffMode: builtInSetting("diffMode") };
  demo.setPresentation({ platform: "linux", preferences });
  const context = { profileId: "demo", repositoryId: id };
  expect(await demo.api.settings.resolve("theme", context)).toEqual({ ok: true, value: theme });
  expect(await demo.api.settings.resolve("background", context)).toEqual({
    ok: true,
    value: background,
  });
  const scope = { kind: "repository" as const, ...context };
  expect((await demo.api.settings.set("diffMode", scope, "split")).ok).toBe(true);
  demo.setPresentation({ platform: "linux", preferences });
  const split = await demo.api.settings.resolve("diffMode", context);
  expect(split.ok && split.value.value).toBe("split");
  expect(preferences.diffMode.value).toBe("unified");
  expect(await demo.api.settings.resolve("background", context)).toEqual({
    ok: true,
    value: background,
  });
  expect((await demo.api.settings.set("diffMode", scope, "unified")).ok).toBe(true);
  const unified = await demo.api.settings.resolve("diffMode", context);
  expect(unified.ok && unified.value.value).toBe("unified");
  const fresh = await createDemo().api.settings.resolve("diffMode", context);
  expect(fresh.ok && fresh.value.value).toBe("unified");
});
it("stages, stashes a selected file and restores it entirely in memory", async () => {
  const { api, hasStash } = createDemo();
  await api.repository.stage({ repositoryId: id, paths: ["README.md"] });
  const staged = await api.repository.status(id);
  expect(staged.ok && staged.value.changes[0]?.index).toBe("M");
  expect(staged.ok && staged.value.changes[1]).toMatchObject({
    path: "src/greeting.ts",
    index: ".",
    worktree: "M",
  });
  await api.stashes.create(id, "Work in progress", "tracked", { paths: ["README.md"] });
  expect(hasStash()).toBe(true);
  const stashed = await api.repository.status(id);
  expect(stashed.ok && stashed.value.changes.map((c) => c.path)).toEqual(["src/greeting.ts"]);
  await api.stashes.apply(id, "demo-stash", true, false);
  const restored = await api.repository.status(id);
  expect(restored.ok && restored.value.changes).toHaveLength(2);
  expect(hasStash()).toBe(false);
});
it("rejects unsupported operations and isolates demo instances", async () => {
  const first = createDemo();
  const second = createDemo();
  expect((await first.api.repository.open("/real/repository")).ok).toBe(false);
  expect((await first.api.remotes.push(id, "token")).ok).toBe(false);
  expect((await first.api.app.debug("reset-data")).ok).toBe(false);
  await first.api.stashes.create(id, "Demo", "tracked");
  expect(second.hasStash()).toBe(false);
  first.reset();
  expect(first.hasStash()).toBe(false);
});
it("has stable, unique step IDs and semantic targets", () => {
  expect(new Set(welcomeTour.map((s) => s.id)).size).toBe(welcomeTour.length);
  for (const step of welcomeTour) expect(step.target).toMatch(/^[a-z0-9-]+$/);
});
