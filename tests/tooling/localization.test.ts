import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLocalization } from "../../scripts/check-localization.ts";

test("catalogs preserve keys, parameters, plural forms, and externalized JSX copy", () => {
  assert.deepEqual(checkLocalization(process.cwd()), []);
});

test("reports duplicate keys, changed translation parameters, and hard-coded expressions", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "eda-localization-"));
  try {
    await mkdir(join(root, "src/shared/locales/en"), { recursive: true });
    await mkdir(join(root, "src/shared/locales/fr"), { recursive: true });
    await writeFile(
      join(root, "src/shared/locales/en/common.json"),
      '{"example.hello":"Hello {name}","example.hello":"Hello {name}","example.rich":"View <code/>"}',
    );
    await writeFile(
      join(root, "src/shared/locales/fr/common.json"),
      '{"example.hello":"Bonjour {nom}","example.rich":"Voir <wrong/>"}',
    );
    await writeFile(
      join(root, "src/Example.tsx"),
      'const Example = () => <><p>SAVE ALL</p><input placeholder="Search now"/><p>{empty ? "Try again" : "Ready"}</p><p>{t("example.hello")}</p></>;',
    );
    const issues = checkLocalization(root);
    assert.ok(issues.some((issue) => issue.includes("duplicate key example.hello")));
    assert.ok(issues.some((issue) => issue.includes("parameters differ from English")));
    assert.ok(
      issues.some(
        (issue) =>
          issue.includes("example.rich") && issue.includes("parameters differ from English"),
      ),
    );
    assert.ok(issues.some((issue) => issue.includes("move visible JSX text")));
    assert.ok(issues.some((issue) => issue.includes("move visible attribute text")));
    assert.ok(issues.some((issue) => issue.includes("move visible expression text")));
    assert.ok(issues.some((issue) => issue.includes("missing parameters: name")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("finds indirect display copy and prevents translations from entering protocol or behavior checks", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "eda-localization-sinks-"));
  try {
    await mkdir(join(root, "src/shared/locales/en"), { recursive: true });
    await writeFile(join(root, "src/shared/locales/en/common.json"), '{"example.ready":"Ready"}');
    await writeFile(
      join(root, "src/labels.ts"),
      `
      export function field(value: unknown, field: string): string { return String(value); }
      export function origin(scope: "command"): string { return { command: "Command configuration" }[scope]; }
      export function makeError(message: string): Error { return new Error(message); }
    `,
    );
    await writeFile(
      join(root, "src/Example.tsx"),
      `
      import { field, origin, makeError } from "./labels";
      declare function t(key: string): string;
      const label = "Default label";
      const current = t("example.ready");
      if (current === "Ready") throw makeError("Invalid settings");
      const protocol = { stdin: t("example.ready") };
      const options = { filters: [{ name: "Images", extensions: ["png"] }] };
      field(undefined, "profile name");
      const Example = () => <>
        <PanelControls name="diff viewer" />
        <button title={label}/>
        <p title={origin("command")}/>
        <DefinitionList items={[{ label: t("example.ready"), value: "No selection" }]}/>
        <Localized id="example.ready" values={{ detail: "Fallback detail" }}/>
      </>;
      const technical = { className: "text-red-500", stdin: "delete refs/heads/main", key: "ArrowLeft" };
    `,
    );
    const issues = checkLocalization(root);
    for (const reason of [
      "display default label",
      "visible attribute",
      "display property name",
      "display argument field",
      "error message argument",
      "display property value",
      "display property detail",
    ])
      assert.ok(
        issues.some((issue) => issue.includes(reason)),
        `${reason}: ${issues.join("\n")}`,
      );
    assert.ok(issues.some((issue) => issue.includes("src/labels.ts")));
    assert.ok(
      issues.some((issue) => issue.includes("compare stable state")),
      issues.join("\n"),
    );
    assert.ok(
      issues.some((issue) => issue.includes("stdin")),
      issues.join("\n"),
    );
    assert.ok(
      !issues.some((issue) => /text-red-500|delete refs\/heads\/main|ArrowLeft/.test(issue)),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
