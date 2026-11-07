import { realpath } from "node:fs/promises";
import type { ElectronApplication } from "playwright";

export async function trustFixture(app: ElectronApplication, root: string) {
  await app.evaluate(
    ({ dialog }, { roots, editor, windows }) => {
      const original = dialog.showMessageBox.bind(dialog);
      dialog.showMessageBox = (
        first: Electron.BaseWindow | Electron.MessageBoxOptions,
        second?: Electron.MessageBoxOptions,
      ) => {
        const options = second ?? (first as Electron.MessageBoxOptions);
        const normalize = (path: string) => {
          const normalized = path.replaceAll("\\", "/");
          return windows ? normalized.toLowerCase() : normalized;
        };
        const detail = options.detail && normalize(options.detail);
        const fixturePath = roots.some((root) => {
          const base = normalize(root);
          return (
            detail &&
            (detail.startsWith(base + "/") ||
              detail.startsWith(base + "\n") ||
              detail.includes(" into " + base + "/"))
          );
        });
        if (options.title === "Repository trust" && fixturePath)
          return Promise.resolve({ response: 1, checkboxChecked: false });
        if (
          options.buttons?.includes("Allow program") &&
          detail &&
          (roots.some((root) => detail.includes(normalize(root) + "/")) ||
            roots.some((root) => options.detail?.includes(JSON.stringify(root).slice(1, -1))) ||
            options.detail === JSON.stringify([editor]))
        )
          return Promise.resolve({ response: 1, checkboxChecked: false });
        return second ? original(first as Electron.BaseWindow, second) : original(options);
      };
    },
    {
      roots: [root, await realpath(root)],
      editor: process.execPath,
      windows: process.platform === "win32",
    },
  );
}
