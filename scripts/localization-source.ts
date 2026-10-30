import ts from "typescript";

export const textProperties = new Set([
  "title",
  "description",
  "label",
  "hint",
  "detail",
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "alt",
  "tooltip",
  "ariaLabel",
  "error",
  "confirmLabel",
  "cancelLabel",
  "emptyLabel",
  "loadingLabel",
  "successLabel",
  "errorLabel",
  "placeholder",
  "message",
  "suggestedAction",
  "reason",
  "unavailableReason",
  "completedLabel",
  "strengthLabel",
  "blurLabel",
  "emptyTitle",
  "emptyDescription",
  "summary",
  "buttons",
  "operation",
  "sampleCommits",
]);
const namedPanels = new Set(["PanelControls", "CollapsiblePanel", "RepositoryPanelState"]);
const displayParameters = new Set([
  "operation",
  "sampleCommits",
  "field",
  "label",
  "suggestedAction",
]);
const messageSetters = new Set(["setError", "setFeedback", "setNotice", "setResult"]);

export interface TextSink {
  expression: ts.Expression;
  reason: string;
}
const propertyName = (name: ts.Node): string | undefined =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;

export function isTextAttribute(attribute: ts.JsxAttribute): boolean {
  const name = attribute.name.getText();
  if (textProperties.has(name)) return true;
  const tag = attribute.parent.parent.tagName.getText().split(".").at(-1)!;
  return (
    (name === "name" && namedPanels.has(tag)) ||
    (name === "kind" && tag === "TransferProgress") ||
    (name === "value" && ["Input", "Textarea"].includes(tag))
  );
}

export function isTranslatable(value: string): boolean {
  return (
    /[a-zA-Z]/.test(value) &&
    !/^\.[a-zA-Z0-9]+$/.test(value.trim()) &&
    !/^(?:\p{Extended_Pictographic}\uFE0F?\s*)?(?:feat|fix|docs|refactor|chore|test|style|perf):\s*$/u.test(
      value,
    ) &&
    !/^[a-z][a-zA-Z0-9_-]*(?:[.:][a-zA-Z0-9_-]+)+$/.test(value.trim()) &&
    !/^(?:[A-Z]|SSH|GPG|HEAD|MIT|HTTPS|GPL-[0-9.]+|URL|Eda|Git|GitHub|GitLab|Bitbucket|Azure DevOps|[\w.-]+@[\w.-]+|[\w.-]+\.(?:md|ts|tsx|json)|https?:\/\/\S+|px|KB|MB|GB|\{(?:base|current|incoming|result)\})$/.test(
      value.trim(),
    )
  );
}

/** Check displayed text and interpolation values; skip conditions and translation keys. */
export function displayLiterals(
  expression: ts.Expression,
  checker?: ts.TypeChecker,
  visited = new Set<ts.Node>(),
): ts.Expression[] {
  if (visited.has(expression)) return [];
  visited.add(expression);
  const follow = (node: ts.Expression) => displayLiterals(node, checker, visited);
  if (ts.isStringLiteralLike(expression))
    return isTranslatable(expression.text) ? [expression] : [];
  if (ts.isArrayLiteralExpression(expression))
    return expression.elements.flatMap((item) => (ts.isExpression(item) ? follow(item) : []));
  if (ts.isConditionalExpression(expression))
    return [...follow(expression.whenTrue), ...follow(expression.whenFalse)];
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  )
    return follow(expression.expression);
  if (
    ts.isBinaryExpression(expression) &&
    [
      ts.SyntaxKind.QuestionQuestionToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.AmpersandAmpersandToken,
    ].includes(expression.operatorToken.kind)
  )
    return expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      ? follow(expression.right)
      : [...follow(expression.left), ...follow(expression.right)];
  if (ts.isTemplateExpression(expression)) {
    const text =
      expression.head.text + expression.templateSpans.map((span) => span.literal.text).join("");
    if (
      !/\s/.test(text) &&
      /^[a-z][\w-]*\.$/.test(expression.head.text) &&
      expression.templateSpans.every((span) => /^[.:_-]*$/.test(span.literal.text))
    )
      return [];
    if (/[a-zA-Z]{2,}/.test(text) && isTranslatable(text)) return [expression];
    return expression.templateSpans.flatMap((span) => follow(span.expression));
  }
  if (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "t"
  ) {
    const values = expression.arguments[1];
    if (values && ts.isObjectLiteralExpression(values))
      return values.properties.flatMap((property) =>
        ts.isPropertyAssignment(property) ? follow(property.initializer) : [],
      );
    return [];
  }
  if (ts.isIdentifier(expression) && checker) {
    const symbol = checker.getSymbolAtLocation(expression);
    const declaration = symbol?.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer)
      return follow(declaration.initializer);
  }
  if (ts.isElementAccessExpression(expression)) {
    let owner: ts.Expression = expression.expression;
    while (ts.isParenthesizedExpression(owner)) owner = owner.expression;
    if (ts.isObjectLiteralExpression(owner))
      return owner.properties.flatMap((property) =>
        ts.isPropertyAssignment(property) ? follow(property.initializer) : [],
      );
  }
  if (ts.isCallExpression(expression) && checker) {
    const signature = checker.getResolvedSignature(expression);
    const declaration = signature?.declaration;
    const type = signature?.getReturnType();
    const stringResult =
      type &&
      (type.flags & ts.TypeFlags.StringLike ||
        (type.isUnion() &&
          type.types.every(
            (part) =>
              !!(
                part.flags &
                (ts.TypeFlags.StringLike |
                  ts.TypeFlags.Null |
                  ts.TypeFlags.Undefined |
                  ts.TypeFlags.Never)
              ),
          )));
    if (
      stringResult &&
      declaration?.getSourceFile().fileName.replaceAll("\\", "/").includes("/src/") &&
      !declaration.getSourceFile().fileName.replaceAll("\\", "/").includes("/shared/i18n/") &&
      "body" in declaration &&
      declaration.body
    ) {
      const returned: ts.Expression[] = [];
      const returns = (node: ts.Node): void => {
        if (ts.isReturnStatement(node) && node.expression) returned.push(node.expression);
        else if (!ts.isFunctionLike(node)) ts.forEachChild(node, returns);
      };
      if (ts.isBlock(declaration.body)) returns(declaration.body);
      else if (ts.isExpression(declaration.body)) returned.push(declaration.body);
      return returned.flatMap(follow);
    }
  }
  return [];
}

function nativeFilterName(node: ts.PropertyAssignment): boolean {
  let ancestor: ts.Node | undefined = node.parent;
  while (ancestor && !ts.isCallExpression(ancestor)) {
    if (ts.isPropertyAssignment(ancestor) && propertyName(ancestor.name) === "filters") return true;
    ancestor = ancestor.parent;
  }
  return false;
}

function displayTableValue(node: ts.PropertyAssignment): boolean {
  let ancestor: ts.Node | undefined = node.parent;
  while (ancestor && !ts.isStatement(ancestor)) {
    if (ts.isJsxAttribute(ancestor)) {
      const tag = ancestor.parent.parent.tagName.getText().split(".").at(-1)!;
      return (
        (ancestor.name.getText() === "items" && tag === "DefinitionList") ||
        (ancestor.name.getText() === "values" && tag === "Localized")
      );
    }
    ancestor = ancestor.parent;
  }
  return false;
}

const technicalProperties = new Set([
  "stdin",
  "args",
  "className",
  "d",
  "href",
  "src",
  "id",
  "htmlFor",
  "aria-controls",
  "aria-labelledby",
]);

function containsTranslation(node: ts.Node): boolean {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t")
    return true;
  return ts.forEachChild(node, containsTranslation) ?? false;
}

function translatedValue(
  node: ts.Node,
  checker: ts.TypeChecker,
  seen = new Set<ts.Node>(),
): boolean {
  if (seen.has(node)) return false;
  seen.add(node);
  if (ts.isIdentifier(node)) {
    const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer)
      return translatedValue(declaration.initializer, checker, seen);
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t")
    return true;
  if (ts.isConditionalExpression(node))
    return (
      translatedValue(node.whenTrue, checker, seen) ||
      translatedValue(node.whenFalse, checker, seen)
    );
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    return translatedValue(node.expression, checker, seen);
  if (ts.isTemplateExpression(node))
    return node.templateSpans.some((span) => translatedValue(span.expression, checker, seen));
  if (
    ts.isBinaryExpression(node) &&
    [
      ts.SyntaxKind.PlusToken,
      ts.SyntaxKind.QuestionQuestionToken,
      ts.SyntaxKind.BarBarToken,
    ].includes(node.operatorToken.kind)
  )
    return translatedValue(node.left, checker, seen) || translatedValue(node.right, checker, seen);
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ["toLowerCase", "toLocaleLowerCase", "toUpperCase", "toLocaleUpperCase", "trim"].includes(
      node.expression.name.text,
    )
  )
    return translatedValue(node.expression.expression, checker, seen);
  return false;
}

export function translationMisuses(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): { node: ts.Node; message: string }[] {
  const issues: { node: ts.Node; message: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      technicalProperties.has(propertyName(node.name) ?? "") &&
      containsTranslation(node.initializer)
    )
      issues.push({
        node: node.initializer,
        message: `translation used in protocol property ${node.name.getText(source)}`,
      });
    if (
      ts.isJsxAttribute(node) &&
      technicalProperties.has(node.name.getText(source)) &&
      node.initializer &&
      containsTranslation(node.initializer)
    )
      issues.push({
        node: node.initializer,
        message: `translation used in technical attribute ${node.name.getText(source)}`,
      });
    if (ts.isTaggedTemplateExpression(node) && containsTranslation(node.template))
      issues.push({ node: node.template, message: "translation used in a tagged code template" });
    if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
      ].includes(node.operatorToken.kind) &&
      (translatedValue(node.left, checker) || translatedValue(node.right, checker))
    )
      issues.push({
        node,
        message: "compare stable state or identifiers instead of translated text",
      });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return issues;
}

export function textSinks(source: ts.SourceFile, checker: ts.TypeChecker): TextSink[] {
  const sinks: TextSink[] = [];
  const add = (expression: ts.Expression | undefined, reason: string) => {
    if (expression) sinks.push({ expression, reason });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (
        name &&
        (textProperties.has(name) ||
          (name === "name" && nativeFilterName(node)) ||
          (name === "value" && displayTableValue(node)) ||
          (displayTableValue(node) &&
            node.parent.parent.parent &&
            ts.isJsxAttribute(node.parent.parent.parent) &&
            node.parent.parent.parent.name.getText() === "values"))
      )
        add(node.initializer, `display property ${name}`);
    }
    if (
      (ts.isBindingElement(node) || ts.isParameter(node) || ts.isVariableDeclaration(node)) &&
      node.initializer
    ) {
      const name = propertyName(node.name);
      if (name && textProperties.has(name)) add(node.initializer, `display default ${name}`);
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      textProperties.has(node.left.name.text)
    )
      add(node.right, `display assignment ${node.left.name.text}`);
    if (ts.isJsxAttribute(node) && node.initializer && isTextAttribute(node)) {
      add(
        ts.isJsxExpression(node.initializer)
          ? node.initializer.expression
          : ts.isStringLiteral(node.initializer)
            ? node.initializer
            : undefined,
        "visible attribute",
      );
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression.getText(source);
      const signature = checker.getResolvedSignature(node);
      const declaration = signature?.declaration;
      const declarationFile = declaration?.getSourceFile().fileName.replaceAll("\\", "/");
      node.arguments?.forEach((argument, index) => {
        const parameter = declaration?.parameters[index];
        const name = parameter && propertyName(parameter.name);
        const ownHelper = declarationFile?.includes("/src/");
        const errorFactory =
          signature &&
          /^(?:GitError|Error|never)$/.test(checker.typeToString(signature.getReturnType()));
        if (ownHelper && name === "message" && errorFactory)
          add(argument, "error message argument");
        if (
          ownHelper &&
          name &&
          (displayParameters.has(name) ||
            (name === "kind" &&
              /\/(?:operation-manager|repository-writer)\.ts$/.test(declarationFile!)))
        )
          add(argument, `display argument ${name}`);
        if (
          (messageSetters.has(callee) || ["Error", "TypeError", "RangeError"].includes(callee)) &&
          index === 0
        )
          add(argument, "display message argument");
        if (callee === "t" && index === 1 && ts.isObjectLiteralExpression(argument)) {
          argument.properties.forEach((property) => {
            if (ts.isPropertyAssignment(property))
              add(property.initializer, "translation parameter");
          });
        }
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return sinks;
}
