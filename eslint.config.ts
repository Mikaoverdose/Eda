import { builtinModules } from "node:module";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import type { ESLint, Linter } from "eslint";

const crossProcess = (from: string, message: string) => [
  { group: [`**/${from}`, `**/${from}/**`, `@${from}/**`], message },
];

const testOnlyImports = [
  {
    group: ["**/tests/**"],
    message: "Application code may not import test suites, fixtures or helpers.",
  },
];

const boundaries = {
  renderer: {
    files: ["src/renderer/**/*.{ts,tsx}"],
    patterns: [
      ...testOnlyImports,
      { group: ["lucide-react"], message: "Import icons through components/ui/icons.tsx." },
      {
        group: ["electron", "node:*", ...builtinModules],
        message:
          "The renderer is sandboxed. Node primitives are unavailable by design; go through the IPC contract.",
      },
      ...crossProcess(
        "main",
        "renderer/ may not import from main/ — use the shared IPC contract types.",
      ),
    ],
  },
  main: {
    files: ["src/main/**/*.ts"],
    patterns: [
      ...testOnlyImports,
      ...crossProcess(
        "renderer",
        "main/ may not import from renderer/ — use the shared IPC contract types.",
      ),
    ],
  },
};

const sharedComponentImports = {
  group: [
    "**/app/**",
    "@renderer/app/**",
    "**/features/**",
    "@renderer/features/**",
    "**/devtools/**",
    "@renderer/devtools/**",
  ],
  message: "Shared components may not depend on app composition, features or devtools.",
};

const rendererSyntaxRestrictions = [
  "error",
  {
    selector: "Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
    message: "No hardcoded colors. Add a token in styles/tokens.css and reference it via var(--…).",
  },
  {
    selector: 'JSXElement > JSXOpeningElement[name.name="svg"]',
    message:
      "No hand-written SVG icons. Re-export the icon you need from lucide-react in components/ui/icons.tsx.",
  },
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.object.name='window'][callee.property.name='dispatchEvent']",
    message:
      "Use typed state or callbacks for application communication instead of global window events.",
  },
] as const;

export default defineConfig([
  {
    ignores: ["dist/**", "node_modules/**", "release/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "tests/**/*.{ts,tsx}", "*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2023, sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    // The plugin's types target older ESLint versions, but it works with ESLint 10.
    plugins: { "@typescript-eslint": tseslint as unknown as ESLint.Plugin },
    rules: {
      ...tseslint.configs["recommended"]!.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  {
    files: boundaries.renderer.files,
    ignores: ["src/renderer/components/ui/icons.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: boundaries.renderer.patterns }],
      "no-restricted-syntax": [...rendererSyntaxRestrictions],
    },
  },

  {
    files: ["src/renderer/components/**/*.{ts,tsx}"],
    ignores: ["src/renderer/components/ui/icons.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [...boundaries.renderer.patterns, sharedComponentImports],
        },
      ],
    },
  },

  {
    files: ["src/renderer/components/ui/icons.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...boundaries.renderer.patterns.filter(
              (pattern) => !pattern.group.includes("lucide-react"),
            ),
            sharedComponentImports,
          ],
        },
      ],
    },
  },

  {
    files: ["src/renderer/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...boundaries.renderer.patterns,
            {
              group: ["**/app/**", "@renderer/app/**"],
              message:
                "Features may not depend on app composition; pass callbacks or use shared commands.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["src/renderer/features/history/CommitRow.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name=/^(button|input|select|textarea)$/]",
          message: "Use the shared UI primitives; native controls belong in components/ui/.",
        },
        {
          selector: "Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message:
            "No hardcoded colors. Add a token in styles/tokens.css and reference it via var(--…).",
        },
      ],
    },
  },

  ...[
    {
      files: boundaries.main.files,
      ignores: ["src/main/git/**", "src/main/persistence/**"],
      process: false,
      database: false,
    },
    { files: ["src/main/git/**/*.ts"], ignores: [], process: true, database: false },
    { files: ["src/main/persistence/**/*.ts"], ignores: [], process: false, database: true },
  ].map((boundary): Linter.Config => ({
    files: boundary.files,
    ignores: boundary.ignores,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...boundaries.main.patterns,
            ...(!boundary.database
              ? [
                  {
                    group: ["drizzle-orm", "drizzle-orm/**"],
                    message: "Database access belongs in src/main/persistence/.",
                  },
                ]
              : []),
          ],
          paths: [
            ...(!boundary.process
              ? ["child_process", "node:child_process"].map((name) => ({
                  name,
                  message: "Only src/main/git/ spawns processes, so that surface stays auditable.",
                }))
              : []),
            ...(!boundary.database
              ? ["sqlite", "node:sqlite"].map((name) => ({
                  name,
                  message: "Database access belongs in src/main/persistence/.",
                }))
              : []),
          ],
        },
      ],
    },
  })),
  {
    files: ["src/shared/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...testOnlyImports,
            {
              group: [
                "electron",
                "node:*",
                ...builtinModules,
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
              ],
              message: "Shared contracts must be independent of the runtime and UI.",
            },
            ...crossProcess(
              "main",
              "Shared contracts may not depend on main-process implementation.",
            ),
            ...crossProcess(
              "renderer",
              "Shared contracts may not depend on renderer implementation.",
            ),
          ],
        },
      ],
    },
  },

  {
    files: ["src/renderer/**/*.tsx"],
    ignores: ["src/renderer/components/ui/**", "src/renderer/features/history/CommitRow.tsx"],
    rules: {
      "no-restricted-syntax": [
        ...rendererSyntaxRestrictions,
        {
          selector: "JSXOpeningElement[name.name=/^(button|input|select|textarea)$/]",
          message: "Use the shared UI primitives; native controls belong in components/ui/.",
        },
      ],
    },
  },

  {
    files: [
      "src/renderer/app/**/*.{ts,tsx}",
      "src/renderer/features/**/*.{ts,tsx}",
      "src/renderer/devtools/**/*.{ts,tsx}",
      "src/renderer/commands/**/*.ts",
    ],
    ignores: ["src/renderer/features/history/CommitRow.tsx"],
    rules: {
      "no-restricted-syntax": [
        ...rendererSyntaxRestrictions,
        {
          selector: "JSXOpeningElement[name.name=/^(button|input|select|textarea)$/]",
          message: "Use the shared UI primitives; native controls belong in components/ui/.",
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName)$/]",
          message:
            "Use React refs for owned UI elements. DOM discovery belongs in shared interaction primitives or the tutorial integration, with an explicit reason.",
        },
      ],
    },
  },

  {
    files: ["src/main/**/*.ts"],
    ignores: ["src/main/secrets/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='safeStorage']",
          message: "All secret access goes through SecretStore in src/main/secrets/.",
        },
      ],
    },
  },

  {
    files: ["src/renderer/styles/themes.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
]);
