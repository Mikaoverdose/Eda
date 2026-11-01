const COMMIT_TYPES = [
  { name: "feat", emoji: "✨" },
  { name: "fix", emoji: "🐛" },
  { name: "build", emoji: "📦" },
  { name: "chore", emoji: "🔧" },
  { name: "ci", emoji: "👷" },
  { name: "docs", emoji: "📚" },
  { name: "style", emoji: "🎨" },
  { name: "refactor", emoji: "♻️" },
  { name: "perf", emoji: "🚀" },
  { name: "test", emoji: "🧪" },
] as const;

export const DEFAULT_COMMIT_PREFIXES = COMMIT_TYPES.map((type) => type.name);

export function defaultCommitPrefixes(emojis: boolean): string[] {
  return COMMIT_TYPES.map(({ name, emoji }) => (emojis ? `${emoji} ${name}` : name));
}

export function parseCommitPrefixes(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
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
