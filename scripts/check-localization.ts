import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import {
  displayLiterals,
  isTextAttribute,
  isTranslatable,
  textSinks,
  translationMisuses,
} from "./localization-source.ts";

type Message = string | Record<string, string>;
type Messages = Record<string, Message>;
const categories = new Set(["zero", "one", "two", "few", "many", "other"]);
const parameters = (message: string): string[] =>
  [
    ...new Set([
      ...[...message.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map((match) => match[1]!),
      ...[...message.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\s*\/>/g)].map((match) => match[1]!),
    ]),
  ].sort();
const variants = (message: Message): string[] =>
  typeof message === "string" ? [message] : Object.values(message);

export function checkLocalization(root: string): string[] {
  const issues: string[] = [];
  const directory = join(root, "src/shared/locales");
  const catalogs = new Map<string, Messages>();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      if (Intl.getCanonicalLocales(entry.name)[0] !== entry.name)
        issues.push(`${entry.name}: use a canonical BCP-47 locale directory`);
    } catch {
      issues.push(`${entry.name}: invalid BCP-47 locale directory`);
    }
    const messages: Messages = {};
    for (const file of readdirSync(join(directory, entry.name)).filter((name) =>
      name.endsWith(".json"),
    )) {
      const contents = readFileSync(join(directory, entry.name, file), "utf8");
      const json = ts.parseJsonText(file, contents);
      const statement = json.statements[0];
      if (
        statement &&
        ts.isExpressionStatement(statement) &&
        ts.isObjectLiteralExpression(statement.expression)
      ) {
        const keys = new Set<string>();
        for (const property of statement.expression.properties) {
          if (!property.name || !ts.isStringLiteral(property.name)) continue;
          if (keys.has(property.name.text))
            issues.push(`${entry.name}/${file}: duplicate key ${property.name.text}`);
          keys.add(property.name.text);
        }
      }
      const data = JSON.parse(contents) as Messages;
      for (const [key, message] of Object.entries(data)) {
        const location = `${entry.name}/${file}: ${key}`;
        if (Object.hasOwn(messages, key)) issues.push(`${location}: duplicate key across catalogs`);
        if (!/^(?:[a-z][a-zA-Z0-9]*\.)+[a-z][a-zA-Z0-9]*$/.test(key))
          issues.push(`${location}: use dot-separated lowerCamelCase keys`);
        if (
          typeof message !== "string" &&
          (!message ||
            typeof message !== "object" ||
            Array.isArray(message) ||
            !Object.hasOwn(message, "other"))
        ) {
          issues.push(`${location}: plural messages require an other form`);
          continue;
        }
        if (
          typeof message !== "string" &&
          Object.keys(message).some((form) => !categories.has(form))
        )
          issues.push(`${location}: invalid plural category`);
        const forms = variants(message);
        if (forms.some((form) => typeof form !== "string" || !form.trim()))
          issues.push(`${location}: empty or invalid message`);
        else if (
          forms.some(
            (form) => JSON.stringify(parameters(form)) !== JSON.stringify(parameters(forms[0]!)),
          )
        )
          issues.push(`${location}: plural forms must preserve named parameters`);
        messages[key] = message;
      }
    }
    catalogs.set(entry.name, messages);
  }
  const english = catalogs.get("en")!;
  for (const [locale, messages] of catalogs) {
    if (locale === "en") continue;
    for (const [key, message] of Object.entries(messages)) {
      if (!Object.hasOwn(english, key)) issues.push(`${locale}: unknown key ${key}`);
      else if (typeof english[key] !== "string" && typeof message === "string")
        issues.push(`${locale}: ${key}: preserve plural message forms`);
      else if (
        JSON.stringify(parameters(variants(message)[0]!)) !==
        JSON.stringify(parameters(variants(english[key]!)[0]!))
      )
        issues.push(`${locale}: ${key}: parameters differ from English`);
    }
  }

  const src = join(root, "src");
  const files = readdirSync(src, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
  const configPath = join(root, "tsconfig.json");
  const options: ts.CompilerOptions = existsSync(configPath)
    ? ts.parseJsonConfigFileContent(
        ts.readConfigFile(configPath, ts.sys.readFile).config,
        ts.sys,
        root,
      ).options
    : { target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.ReactJSX };
  const program = ts.createProgram(files, { ...options, noEmit: true });
  const checker = program.getTypeChecker();
  const reported = new Set<string>();
  for (const file of files) {
    const source = program.getSourceFile(file)!;
    const report = (node: ts.Node, message: string) => {
      const owner = node.getSourceFile();
      const location = `${owner.fileName}:${node.getStart(owner)}`;
      if (reported.has(location)) return;
      reported.add(location);
      const { line } = owner.getLineAndCharacterOfPosition(node.getStart(owner));
      issues.push(`${relative(root, owner.fileName)}:${line + 1}: ${message}`);
    };
    const human = isTranslatable;
    const checkVisibleExpression = (expression: ts.Expression): void => {
      if (
        (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) &&
        human(expression.text)
      )
        report(expression, "move visible expression text into a JSON catalog");
      else if (ts.isConditionalExpression(expression)) {
        checkVisibleExpression(expression.whenTrue);
        checkVisibleExpression(expression.whenFalse);
      } else if (ts.isParenthesizedExpression(expression))
        checkVisibleExpression(expression.expression);
      else if (
        ts.isBinaryExpression(expression) &&
        [
          ts.SyntaxKind.QuestionQuestionToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.AmpersandAmpersandToken,
        ].includes(expression.operatorToken.kind)
      )
        checkVisibleExpression(expression.right);
      else if (ts.isTemplateExpression(expression)) {
        const parts = [
          expression.head.text,
          ...expression.templateSpans.map((span) => span.literal.text),
        ];
        if (parts.some((part) => /[a-zA-Z]{2,}/.test(part) && human(part)))
          report(expression, "move the complete visible template into a JSON catalog");
      }
    };
    const visit = (node: ts.Node): void => {
      if (
        ts.isJsxExpression(node) &&
        node.expression &&
        (!ts.isJsxAttribute(node.parent) || isTextAttribute(node.parent))
      )
        checkVisibleExpression(node.expression);
      if (ts.isJsxText(node) && human(node.text))
        report(node, "move visible JSX text into a JSON catalog");
      if (
        ts.isJsxAttribute(node) &&
        isTextAttribute(node) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        human(node.initializer.text)
      )
        report(node, "move visible attribute text into a JSON catalog");
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "t"
      ) {
        const key = node.arguments[0];
        const values = node.arguments[1];
        if (key && ts.isStringLiteral(key)) {
          const message = english[key.text];
          if (!message) report(key, `unknown message key ${key.text}`);
          else {
            const required = parameters(variants(message)[0]!);
            if (!values && required.length)
              report(key, `missing parameters: ${required.join(", ")}`);
            else if (
              values &&
              ts.isObjectLiteralExpression(values) &&
              !values.properties.some(ts.isSpreadAssignment)
            ) {
              const names = values.properties.map((property) =>
                property.name &&
                (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
                  ? property.name.text
                  : "",
              );
              const missing = required.filter((name) => !names.includes(name));
              if (missing.length) report(values, `missing parameters: ${missing.join(", ")}`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const issue of translationMisuses(source, checker)) report(issue.node, issue.message);
    for (const sink of textSinks(source, checker)) {
      for (const literal of displayLiterals(sink.expression, checker))
        report(literal, `move ${sink.reason} text into a JSON catalog`);
    }
  }
  return issues;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const issues = checkLocalization(fileURLToPath(new URL("..", import.meta.url)));
  if (issues.length) {
    console.error(issues.join("\n"));
    process.exitCode = 1;
  } else console.log("Localization catalogs and visible JSX strings are valid.");
}
