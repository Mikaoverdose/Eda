import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";

// Build scripts report developer diagnostics, so this check only scans app code.
test("desktop exceptions use the shared error contract and deferred localization", () => {
  const files = readdirSync("src", { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const program = ts.createProgram(files, parsed.options);
  const checker = program.getTypeChecker();
  const failures: string[] = [];
  for (const file of files) {
    const source = program.getSourceFile(file)!;
    const report = (node: ts.Node, message: string) => {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      failures.push(`${file}:${line}: ${message}`);
    };
    const visit = (node: ts.Node): void => {
      if (
        ts.isNewExpression(node) &&
        ["Error", "TypeError", "RangeError"].includes(node.expression.getText(source))
      )
        report(node, "use AppError or GitError instead of discarding the error identifier");
      if (
        (ts.isNewExpression(node) && node.expression.getText(source) === "GitError") ||
        (ts.isCallExpression(node) && node.expression.getText(source) === "err")
      ) {
        const input = node.arguments?.[0];
        if (input && ts.isObjectLiteralExpression(input))
          for (const property of input.properties) {
            const name = property.name?.getText(source);
            if (name !== "message" && name !== "suggestedAction") continue;
            const value = ts.isPropertyAssignment(property)
              ? property.initializer
              : ts.isShorthandPropertyAssignment(property)
                ? property.name
                : undefined;
            if (!value) continue;
            const type = checker.getTypeAtLocation(value);
            const variants = type.isUnion() ? type.types : [type];
            if (variants.some((variant) => (variant.flags & ts.TypeFlags.StringLike) !== 0))
              report(
                value,
                "pass errorText(key, values), not a rendered or hardcoded error string",
              );
          }
      }
      if (ts.isObjectLiteralExpression(node) && !file.endsWith("src/shared/errors.ts")) {
        const type = checker.getContextualType(node);
        const isInlineError =
          ts.isPropertyAssignment(node.parent) &&
          node.parent.name.getText(source) === "error" &&
          node.properties.some((property) => property.name?.getText(source) === "kind");
        if (isInlineError || (type && checker.typeToString(type).includes("GitErrorData")))
          report(
            node,
            "create error data through GitError.toData() instead of losing its localization reference",
          );
      }
      if (
        file.includes("src/renderer/") &&
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "String"
      ) {
        const value = node.arguments[0];
        if (value && /^(error|failure)$/.test(value.getText(source)))
          report(node, "format unknown failures through errorMessage(), never String(error)");
      }
      const condition = ts.isIfStatement(node)
        ? node.expression
        : ts.isConditionalExpression(node)
          ? node.condition
          : undefined;
      if (condition && checker.typeToString(checker.getTypeAtLocation(condition)) === "ErrorText")
        report(condition, "test the error condition before creating a localization reference");
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(failures, []);
  assert(files.some((file) => file.endsWith("src/shared/errors.ts")));
});
