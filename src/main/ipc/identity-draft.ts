import { t } from "@shared/i18n";
import type { IdentityDraft } from "@shared/identity/identity";
import { isHexColor } from "@shared/preferences/accent";
import {
  optionalRecord,
  optionalString,
  requireEmail,
  requireHue,
  requireString,
  requireStringArray,
} from "./validate";

type Signing = IdentityDraft["signing"];

const parseAccent = (value: unknown) => (isHexColor(value) ? value : requireHue(value));

function parseSigning(raw: unknown): Signing {
  const signing = optionalRecord(raw);
  const format = String(signing["format"] ?? "none");
  const keyRef = optionalString(signing["keyRef"], t("fields.signingKey"));

  return {
    format: format === "ssh" || format === "gpg" ? format : "none",
    ...(keyRef !== undefined && { keyRef }),
    signCommits: signing["signCommits"] === true,
  };
}

export function parseDraft(raw: unknown): IdentityDraft {
  const input = optionalRecord(raw);
  const username = optionalString(input["username"], t("fields.username"), 128);
  const avatarPath = optionalString(input["avatarPath"], t("fields.avatarPath"));
  const sshKeyPath = optionalString(input["sshKeyPath"], t("main.identityDraft.sshKeyPath"));

  return {
    name: requireString(input["name"], t("fields.identityName"), 64),
    gitName: requireString(input["gitName"], t("main.identityDraft.gitName"), 128),
    gitEmail: requireEmail(input["gitEmail"], t("main.identityDraft.gitEmail")),
    ...(username !== undefined && { username }),
    ...(avatarPath !== undefined && { avatarPath }),
    hue: parseAccent(input["hue"]),
    ...(sshKeyPath !== undefined && { sshKeyPath }),
    signing:
      input["signing"] === undefined
        ? { format: "none", signCommits: false }
        : parseSigning(input["signing"]),
    rules:
      input["rules"] === undefined ? [] : requireStringArray(input["rules"], t("fields.rules")),
  };
}

export function parsePartialDraft(raw: unknown): Partial<IdentityDraft> {
  const input = optionalRecord(raw);
  const draft: Partial<IdentityDraft> = {};

  if (input["name"] !== undefined)
    draft.name = requireString(input["name"], t("fields.identityName"), 64);
  if (input["gitName"] !== undefined)
    draft.gitName = requireString(input["gitName"], t("main.identityDraft.gitName"), 128);
  if (input["gitEmail"] !== undefined)
    draft.gitEmail = requireEmail(input["gitEmail"], t("main.identityDraft.gitEmail"));
  if (input["hue"] !== undefined) draft.hue = parseAccent(input["hue"]);
  if (input["rules"] !== undefined)
    draft.rules = requireStringArray(input["rules"], t("fields.rules"));
  if (input["signing"] !== undefined) draft.signing = parseSigning(input["signing"]);

  const username = optionalString(input["username"], t("fields.username"), 128);

  if (username !== undefined) draft.username = username;

  const sshKeyPath = optionalString(input["sshKeyPath"], t("main.identityDraft.sshKeyPath"));

  if (sshKeyPath !== undefined) draft.sshKeyPath = sshKeyPath;

  return draft;
}
