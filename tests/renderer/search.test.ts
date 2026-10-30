import { createTextSearch } from "@renderer/utils/search";

it("matches every term regardless of case, order or extra whitespace", () => {
  const matches = createTextSearch("  REPO\topen  ");
  expect(matches("Open repository")).toBe(true);
  expect(matches("Repository settings")).toBe(false);
  expect(matches("Open settings")).toBe(false);
});

it("matches all rows for empty queries and treats punctuation literally", () => {
  expect(createTextSearch(" \n ")("")).toBe(true);
  expect(createTextSearch("[main]")("Branch [main]")).toBe(true);
  expect(createTextSearch("[main]")("Branch main")).toBe(false);
});
