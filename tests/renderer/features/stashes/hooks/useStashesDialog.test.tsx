import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { StashList } from "@shared/workflows/stashes";
import { useStashesDialog } from "@renderer/features/stashes/hooks/useStashesDialog";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("ignores a list response from the previously selected repository", async () => {
  const pending = new Map<string, (value: { ok: true; value: StashList }) => void>();

  vi.stubGlobal("eda", {
    stashes: {
      list: (repositoryId: string) =>
        new Promise((resolve) => {
          pending.set(repositoryId, resolve);
        }),
    },
  });

  function View({ repositoryId }: { repositoryId: string }) {
    const { list } = useStashesDialog(repositoryId);
    return <span>{list.truncated ? "new" : "old"}</span>;
  }

  await act(async () => root.render(<View repositoryId="old" />));
  await act(async () => root.render(<View repositoryId="new" />));
  await act(async () =>
    pending.get("new")?.({ ok: true, value: { entries: [], truncated: true } }),
  );
  await act(async () =>
    pending.get("old")?.({ ok: true, value: { entries: [], truncated: false } }),
  );
  expect(container.textContent).toBe("new");
});
