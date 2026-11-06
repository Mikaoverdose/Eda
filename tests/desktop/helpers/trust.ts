import type { ElectronApplication } from "playwright";

export async function trustFixture(app: ElectronApplication, root: string) {
  await app.evaluate(
    ({ dialog }, { root, editor }) => {
      const original = dialog.showMessageBox.bind(dialog);
      dialog.showMessageBox = (
        first: Electron.BaseWindow | Electron.MessageBoxOptions,
        second?: Electron.MessageBoxOptions,
      ) => {
        const options = second ?? (first as Electron.MessageBoxOptions);
        const detail = options.detail?.replaceAll("\\", "/");
        const base = root.replaceAll("\\", "/");
        if (
          options.title === "Repository trust" &&
          detail &&
          (detail.startsWith(base + "/") ||
            detail.startsWith(base + "\n") ||
            detail.includes(" into " + base + "/"))
        )
          return Promise.resolve({ response: 1, checkboxChecked: false });
        if (
          options.buttons?.includes("Allow program") &&
          detail &&
          (detail.includes(base + "/") ||
            options.detail?.includes(JSON.stringify(root).slice(1, -1)) ||
            options.detail === JSON.stringify([editor]))
        )
          return Promise.resolve({ response: 1, checkboxChecked: false });
        return second ? original(first as Electron.BaseWindow, second) : original(options);
      };
    },
    { root, editor: process.execPath },
  );
}
