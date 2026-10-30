import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ThemePreference } from "@shared/preferences/settings";
import { ThemePreferences } from "@renderer/features/settings/appearance/ThemePreferences";

it.each(["system", "light", "dark"] as const)(
  "keeps %s mode when choosing themes",
  async (initialMode) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

    const container = document.createElement("div");

    document.body.append(container);

    const root = createRoot(container);

    function Example() {
      const [value, setValue] = useState<ThemePreference>({
        mode: initialMode,
        light: "lavender-light",
        dark: "nord",
      });
      return <ThemePreferences value={value} onChange={setValue} />;
    }

    try {
      await act(async () => root.render(<Example />));

      const mode = () =>
        container.querySelector<HTMLInputElement>('[aria-label="Appearance mode"] input:checked')
          ?.value;
      const select = async (id: string) =>
        act(async () => container.querySelector<HTMLInputElement>(`input[value="${id}"]`)!.click());

      expect(mode()).toBe(initialMode);

      await select("lavender-light");
      expect(mode()).toBe(initialMode);

      await select("nord");
      expect(mode()).toBe(initialMode);

      await select("eda-light");
      expect(mode()).toBe(initialMode);
      expect(container.querySelector<HTMLInputElement>('input[value="eda-light"]')!.checked).toBe(
        true,
      );

      await select("eda-dark");
      expect(mode()).toBe(initialMode);

      await select("light");
      expect(mode()).toBe("light");

      await select("dark");
      expect(mode()).toBe("dark");
      expect(container.querySelector<HTMLInputElement>('input[value="eda-dark"]')!.checked).toBe(
        true,
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);
