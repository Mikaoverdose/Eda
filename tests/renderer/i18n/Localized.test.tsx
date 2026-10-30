import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Localized } from "@renderer/i18n/Localized";

it("renders named rich text slots while escaping user-provided text", () => {
  const html = renderToStaticMarkup(
    <Localized
      id="stashBranchDialog.createAtStashBase"
      values={{ strong: <strong>{"<feature>"}</strong>, code2: <code>abc123</code> }}
    />,
  );
  expect(html).toBe("Create <strong>&lt;feature&gt;</strong> at stash base <code>abc123</code>.");
});

it("renders plural counts without requiring a duplicate slot value", () => {
  expect(renderToStaticMarkup(<Localized id="profilesSettings.profileCount" count={2} />)).toBe(
    "2 profiles",
  );
});

it("keeps strings that resemble markup or interpolation tokens as literal React text", () => {
  const html = renderToStaticMarkup(
    <Localized
      id="stashBranchDialog.leaveAt"
      values={{ value1: "<code2/> {count} $t(common.close)", code2: <code>abc123</code> }}
    />,
  );
  expect(html).toContain("&lt;code2/&gt; {count} $t(common.close)");
  expect(html).toContain("<code>abc123</code>");
});
