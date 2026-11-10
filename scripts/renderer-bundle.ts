import type { Manifest } from "vite";

export function startupChunks(manifest: Manifest): Set<string> {
  const files = new Set<string>();
  const visited = new Set<string>();

  const visit = (key: string) => {
    if (visited.has(key)) return;
    visited.add(key);

    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing renderer chunk: ${key}`);

    files.add(chunk.file);
    for (const dependency of chunk.imports ?? []) visit(dependency);
  };

  if (!manifest["app/App.tsx"]) throw new Error("Renderer manifest has no application entry.");

  for (const [key, chunk] of Object.entries(manifest)) {
    if (chunk.isEntry || key === "app/App.tsx") visit(key);
  }

  return files;
}
