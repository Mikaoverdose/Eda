import type { Locator } from "playwright";

export async function chooseSelect(control: Locator, value: string) {
  await control.click();
  await control
    .page()
    .locator(`[data-eda-select-value=${JSON.stringify(value)}]`)
    .click();
}
