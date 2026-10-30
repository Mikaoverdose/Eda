import { test } from "node:test";
import assert from "node:assert/strict";
import { electronStderr } from "../../scripts/electron-stderr.ts";

const warning =
  "[1258204:1030/181540.633900:ERROR:components/viz/service/display/display.cc:271] Frame latency is negative: -0.027 ms\n";
async function output(chunks: string[], all = false) {
  const stream = electronStderr(all);
  let result = "";
  stream.on("data", (chunk: Buffer) => {
    result += chunk.toString();
  });
  for (const chunk of chunks) stream.write(Buffer.from(chunk));
  stream.end();
  await new Promise<void>((resolve) => stream.on("end", resolve));
  return result;
}

test("deduplicates only the exact Chromium frame diagnostic, even across chunks", async () => {
  const important = "[9:9/1:ERROR:gpu/context.cc:271] Context lost\n";
  const result = await output([
    warning.slice(0, 30),
    warning.slice(30) + warning,
    important,
    "other error",
  ]);
  assert.equal(result.split("Frame latency is negative").length - 1, 1);
  assert.match(result, /Repeated Chromium/);
  assert.ok(result.includes(important));
  assert.ok(result.endsWith("other error"));
});

test("preserves complete diagnostics when requested and unrelated lookalikes", async () => {
  assert.equal(await output([warning, warning], true), warning + warning);
  const other = warning.replace("components/viz/service/display/display.cc", "other/display.cc");
  assert.equal(await output([other, other]), other + other);
});
