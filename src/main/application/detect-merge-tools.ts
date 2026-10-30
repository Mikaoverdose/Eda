import type { DetectedMergeTool } from "@shared/integrations/merge-tool";
import { detectApplications } from "./detect-applications";
import { EDITOR_CANDIDATES } from "./detect-editors";

export async function detectMergeTools(): Promise<DetectedMergeTool[]> {
  const tools = await detectApplications([
    ...EDITOR_CANDIDATES.filter((editor) => ["code", "code-insiders"].includes(editor.command)),
    {
      name: "Meld",
      command: "meld",
      mac: "Meld.app/Contents/MacOS/Meld",
      windows: "Meld/Meld.exe",
    },
    {
      name: "KDiff3",
      command: "kdiff3",
      mac: "kdiff3.app/Contents/MacOS/kdiff3",
      windows: "KDiff3/kdiff3.exe",
    },
  ]);

  return tools.map((tool) => ({
    ...tool,
    args:
      tool.name === "Meld"
        ? ["--output={result}", "{current}", "{base}", "{incoming}"]
        : tool.name === "KDiff3"
          ? ["{base}", "{current}", "{incoming}", "--output", "{result}"]
          : ["--wait", "--merge", "{incoming}", "{current}", "{base}", "{result}"],
  }));
}
