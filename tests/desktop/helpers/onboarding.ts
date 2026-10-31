import type { Page } from "playwright";

export async function finishOnboarding(page: Page) {
  for (const name of ["Make Eda yours", "Find your commit style", "Connect your tools"]) {
    await page.getByRole("heading", { name, exact: true }).waitFor();
    await page
      .getByRole("button", {
        name: name === "Connect your tools" ? "Start using Eda" : "Continue",
        exact: true,
      })
      .click();
  }

  await page.getByRole("heading", { name: "Welcome to Eda.", exact: true }).waitFor();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
}
