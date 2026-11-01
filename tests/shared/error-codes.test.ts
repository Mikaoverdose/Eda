import { errorText } from "@shared/error-codes";
import { afterEach, expect, it } from "vitest";
import { AppError, GitError, errorMessage, errorAction } from "@shared/errors";
import { ERROR_CODE, ERROR_MESSAGE_KEYS } from "@shared/error-codes";
import { UPDATE_API_ERROR, UPDATE_API_ERROR_KEYS } from "@shared/update-api-errors";
import { english, i18n, t } from "@shared/i18n";
import { updateError } from "@main/application/update-service";

afterEach(() => {
  i18n.removeResourceBundle("en", "translation");
  i18n.addResourceBundle("en", "translation", english);
});
it("keeps every runtime and API error mapped to a catalog entry", () => {
  for (const key of [...Object.values(ERROR_MESSAGE_KEYS), ...Object.values(UPDATE_API_ERROR_KEYS)])
    expect(english[key]).toBeTruthy();
});
it("classifies local updater errors by code when translated text changes", () => {
  const key = ERROR_MESSAGE_KEYS[ERROR_CODE.INVALID_STABLE_VERSION];
  const revisedMessage = t("common.cancel");
  expect(revisedMessage).not.toBe(t(key));
  i18n.addResource("en", "translation", key, revisedMessage);
  const error = new AppError(ERROR_CODE.INVALID_STABLE_VERSION);
  expect(error.message).toBe(revisedMessage);
  expect(error.code).toBe(ERROR_CODE.INVALID_STABLE_VERSION);
  expect(updateError(error, "check")).toBe(
    t("main.updateService.theUpdateCouldNotBeVerifiedNothingWas"),
  );
});
it("localizes structured and electron-updater-wrapped API codes", () => {
  const key = UPDATE_API_ERROR_KEYS[UPDATE_API_ERROR.NO_STABLE_RELEASE];
  const revisedMessage = t("common.close");
  expect(revisedMessage).not.toBe(t(key));
  i18n.addResource("en", "translation", key, revisedMessage);
  for (const error of [
    { error: UPDATE_API_ERROR.NO_STABLE_RELEASE },
    Object.assign(new Error(), { code: UPDATE_API_ERROR.NO_STABLE_RELEASE }),
    new Error([404, JSON.stringify({ error: UPDATE_API_ERROR.NO_STABLE_RELEASE })].join("\n")),
  ])
    expect(updateError(error, "check")).toBe(revisedMessage);
});
it("does not display unknown API error codes or upstream prose", () => {
  expect(updateError(new Error('{"error":"PRIVATE_UPSTREAM_DETAIL"}'), "check")).toBe(
    t("main.updateService.couldNotCheckForUpdatesTryAgainLater"),
  );
});

it("preserves stable identifiers and re-localizes errors after an IPC round trip", () => {
  const failure = new GitError({
    kind: "invalid-input",
    operation: "test",
    message: errorText("main.requestErrors.thatIdentityNoLongerExists"),
    suggestedAction: errorText("main.requestErrors.refreshTheIdentityListAndTryAgain"),
  });
  const wire = JSON.parse(JSON.stringify(failure.toData()));
  expect(failure).toBeInstanceOf(AppError);
  expect(wire.code).toBe("main.requestErrors.thatIdentityNoLongerExists");
  const revisedMessage = t("common.close");
  const revisedAction = t("common.cancel");
  expect(wire.message).not.toBe(revisedMessage);
  expect(wire.suggestedAction).not.toBe(revisedAction);
  i18n.addResource("en", "translation", wire.text.key, revisedMessage);
  i18n.addResource("en", "translation", wire.action.key, revisedAction);
  expect(errorMessage(wire)).toBe(revisedMessage);
  expect(errorAction(wire)).toBe(revisedAction);
  const restored = new GitError(wire);
  expect(restored.code).toBe(wire.code);
  expect(restored.kind).toBe(failure.kind);
  expect(restored.message).toBe(revisedMessage);
});
it("does not render unrecognized exception messages or legacy IPC prose", () => {
  const prose = t("common.cancel");
  expect(prose).not.toBe(t("errors.unexpected"));
  for (const failure of [
    new Error(prose),
    { message: prose },
    { text: { key: "not.a.key" }, message: prose },
  ])
    expect(errorMessage(failure)).toBe(t("errors.unexpected"));
  expect(errorAction({ suggestedAction: prose })).toBeUndefined();
});
it("redacts translation values when serializing errors", () => {
  const failure = new GitError({
    kind: "unknown",
    operation: "test",
    message: errorText("errors.operationBlocked", {
      reason: "https://user:private@example.com/repo",
    }),
  });
  expect(failure.message).not.toContain("private");
  expect(JSON.stringify(failure.toData())).not.toContain("private");
});
