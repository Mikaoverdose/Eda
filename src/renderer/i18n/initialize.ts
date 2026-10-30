import { getLocale, i18n, setLocale } from "@shared/i18n";

export async function initializeLocalization(): Promise<void> {
  let requested: string | readonly string[] = navigator.languages;
  try {
    const tutorial =
      window !== window.parent &&
      new URLSearchParams(window.location.search).get("eda-tour") === "1";
    if (tutorial) {
      requested = window.parent.document.documentElement.lang || requested;
    } else {
      const result = await window.eda.settings.resolve("language", {});
      if (result.ok && result.value.value !== "system") requested = result.value.value;
    }
  } catch {}
  setLocale(requested);
  document.documentElement.lang = getLocale();
  document.documentElement.dir = i18n.dir();
}
