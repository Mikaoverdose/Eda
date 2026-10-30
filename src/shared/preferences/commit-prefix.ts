export const DEFAULT_COMMIT_PREFIXES = [
  "feat",
  "fix",
  "build",
  "chore",
  "ci",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
];

const EMOJIS = ["✨", "🐛", "📦", "🔧", "👷", "📚", "🎨", "♻️", "🚀", "🧪"];

export function defaultCommitPrefixes(emojis: boolean): string[] {
  return DEFAULT_COMMIT_PREFIXES.map((type, index) => (emojis ? `${EMOJIS[index]} ${type}` : type));
}

export function isCommitPrefix(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:\p{Extended_Pictographic}[\p{Extended_Pictographic}\uFE0F\u200D]* )?[a-zA-Z][a-zA-Z0-9-]{0,39}$/u.test(
      value,
    )
  );
}

export function matchCommitPrefix(title: string, prefixes: string[]): RegExpExecArray | null {
  const match = /^((?:[^\sA-Za-z][^\s]* )?[a-zA-Z][a-zA-Z0-9-]*)(\([^\r\n)]*\))?(!)?:[ \t]*/.exec(
    title,
  );

  if (!match) return null;

  const configured =
    prefixes.find((prefix) => prefix === match[1]) ??
    prefixes.find((prefix) => prefix.split(" ").at(-1) === match[1]);

  if (!configured) return null;

  match[1] = configured;

  return match;
}
