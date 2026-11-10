import { checkReleaseFeed } from "@main/application/release-feed";
import { updateError } from "@main/application/update-service";

const base = "https://updates.example.test/api/updates/v1/stable/osx/arm64/";
const asset = (Version: string, Type = "Full") => ({
  PackageId: "Eda",
  Version,
  Type,
  NotesMarkdown: "Release notes",
});

it("reads only release metadata and selects the newest full Eda release without a native updater", async () => {
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({
      Assets: [
        asset("0.0.9"),
        asset("0.0.10"),
        asset("0.0.11", "Delta"),
        { ...asset("99.0.0"), PackageId: "Other" },
      ],
    }),
  );

  expect(await checkReleaseFeed(base, "osx", "arm64", request)).toMatchObject({
    available: true,
    release: { version: "0.0.10", name: "Eda 0.0.10", notes: "Release notes" },
  });
  expect(request).toHaveBeenCalledExactlyOnceWith(
    `${base}releases.osx-arm64-stable.json`,
    expect.objectContaining({
      credentials: "omit",
      redirect: "error",
      signal: expect.any(AbortSignal),
    }),
  );
});

it.each([
  { Assets: [] },
  { Assets: [asset("0.0.10", "Delta")] },
  { Assets: [asset("not-a-version")] },
  { Assets: [asset("00.0.10")] },
  { Assets: [{ ...asset("0.0.10"), NotesMarkdown: {} }] },
  { unexpected: true },
])(
  "rejects invalid or incomplete feeds instead of claiming the app is current: %j",
  async (feed) => {
    const request = vi.fn<typeof fetch>(async () => Response.json(feed));
    await expect(checkReleaseFeed(base, "osx", "arm64", request)).rejects.toThrow();
  },
);

it("rejects oversized metadata and preserves structured service errors for localization", async () => {
  const oversized = vi.fn<typeof fetch>(async () => new Response(" ".repeat(256 * 1024 + 1)));
  await expect(checkReleaseFeed(base, "osx", "arm64", oversized)).rejects.toThrow();

  const unavailable = vi.fn<typeof fetch>(async () =>
    Response.json({ error: "NO_RELEASE" }, { status: 404 }),
  );
  try {
    await checkReleaseFeed(base, "osx", "arm64", unavailable);
    expect.fail("The missing release must reject the check");
  } catch (error) {
    expect(updateError(error, "check")).toMatch(/No release/i);
  }
});
