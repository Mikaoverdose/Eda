export default function migrate(vault: Record<string, string>): void {
  for (const key of Object.keys(vault)) {
    const marker = key.indexOf(":provider:");
    if (!key.startsWith("identity:") || marker < 0) continue;
    const suffix = key.slice(marker + ":provider:".length);
    const end = suffix.indexOf("]");
    if (end < 0) continue;
    let owner: unknown;
    try {
      owner = JSON.parse(suffix.slice(0, end + 1));
    } catch {
      continue;
    }
    if (
      Array.isArray(owner) &&
      owner.length === 4 &&
      owner[1] === "github" &&
      owner[2] === "github.com" &&
      key.startsWith(`identity:${owner[0]}:provider:`)
    ) {
      delete vault[key];
    }
  }
}
