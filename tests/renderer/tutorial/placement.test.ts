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

it("leaves the target controls accessible when there is too little room beside the panel", () => {
  const card = { width: 340, height: 230 };
  const viewport = { width: 940, height: 600 };
  const control = { left: 595, top: 85, width: 65, height: 32 };
  const position = placeGuide(
    { left: 35, top: 80, width: 645, height: 500 },
    card,
    viewport,
    control,
  );
  expect(
    position.left + card.width <= control.left ||
      position.left >= control.left + control.width ||
      position.top + card.height <= control.top ||
      position.top >= control.top + control.height,
  ).toBe(true);
});
