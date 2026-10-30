import { motionDuration } from "@renderer/motion";

afterEach(() => {
  document.documentElement.style.removeProperty("--duration-fade");
  document.documentElement.removeAttribute("data-reduced-motion");
  vi.restoreAllMocks();
});

it("reads the CSS fade timing in milliseconds or seconds", () => {
  document.documentElement.style.setProperty("--duration-fade", "240ms");
  expect(motionDuration("fade")).toBe(240);
  document.documentElement.style.setProperty("--duration-fade", "0.18s");
  expect(motionDuration("fade")).toBe(180);
});

it("does not delay transitions when styles are unavailable", () => {
  expect(motionDuration("fade")).toBe(0);
});

it("skips the visual delay for either reduced-motion preference", () => {
  document.documentElement.style.setProperty("--duration-fade", "240ms");
  document.documentElement.dataset["reducedMotion"] = "true";
  expect(motionDuration("fade")).toBe(0);
  document.documentElement.removeAttribute("data-reduced-motion");
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  expect(motionDuration("fade")).toBe(0);
});
