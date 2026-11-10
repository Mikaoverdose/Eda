import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import type { Manifest } from "vite";
import { startupChunks } from "./renderer-bundle.ts";

const root = new URL("../dist/renderer/", import.meta.url);

const manifest = JSON.parse(
  await readFile(new URL(".vite/manifest.json", root), "utf8"),
) as Manifest;

const startup = startupChunks(manifest);
const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith(".js"));

const chunks = await Promise.all(
  files.map(async (file) => {
    const code = await readFile(new URL(file.replaceAll("\\", "/"), root));
    return { file: file.replaceAll("\\", "/"), bytes: code.length, gzip: gzipSync(code).length };
  }),
);

const largest = Math.max(...chunks.map((chunk) => chunk.bytes));
const total = chunks.reduce((size, chunk) => size + chunk.bytes, 0);
const initial = chunks.filter((chunk) => startup.has(chunk.file));
const initialBytes = initial.reduce((size, chunk) => size + chunk.bytes, 0);
const initialGzip = initial.reduce((size, chunk) => size + chunk.gzip, 0);
const totalGzip = chunks.reduce((size, chunk) => size + chunk.gzip, 0);

const budgets = [
  { name: "Largest renderer chunk", bytes: largest, limit: 500_000 },
  { name: "Workspace startup JavaScript", bytes: initialBytes, limit: 1_100_000 },
  { name: "Total renderer JavaScript", bytes: total, limit: 1_450_000 },
];

for (const { name, bytes, limit } of budgets) {
  console.log(`${name}: ${(bytes / 1000).toFixed(2)} kB / ${(limit / 1000).toFixed(0)} kB`);
  if (bytes > limit) process.exitCode = 1;
}

console.log(
  `Gzip: ${(initialGzip / 1000).toFixed(2)} kB startup, ${(totalGzip / 1000).toFixed(2)} kB total`,
);

if (process.exitCode)
  console.error("Renderer bundle budget exceeded. Review its imports and dependencies.");
