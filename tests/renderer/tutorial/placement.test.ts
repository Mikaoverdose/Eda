import { placeGuide } from "@renderer/tutorial/placement";

it("places a guide below a top-bar target when neither horizontal side fits", () => {
  const result = placeGuide(
    { left: 0, top: 0, width: 900, height: 42 },
    { width: 340, height: 230 },
    { width: 1000, height: 700 },
  );
  expect(result.top).toBe(58);
});
it("keeps the guide beside a full-height panel and inside the viewport", () => {
  const result = placeGuide(
    { left: 0, top: 42, width: 650, height: 650 },
    { width: 300, height: 240 },
    { width: 1000, height: 700 },
  );
  expect(result.left).toBe(666);
  expect(result.top + 240).toBeLessThan(700);
});
