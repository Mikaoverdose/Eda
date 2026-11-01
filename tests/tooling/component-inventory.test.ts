import { test } from "node:test";
import { prepareComponentInventory } from "../../scripts/build.ts";

test("the component inventory matches the renderer exports", async () => {
  await prepareComponentInventory(true);
});
