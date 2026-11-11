import { t, type MessageKey } from "@shared/i18n";
import type { CommitSignatureVerification } from "@shared/repository/repository-read";

const reasons: Record<NonNullable<CommitSignatureVerification["reasonCode"]>, MessageKey> = {
  "bad-signature": "diff.commitDetails.signatureInvalid",
  "missing-key": "diff.commitDetails.signatureMissingKey",
  "missing-trust": "diff.commitDetails.signatureMissingTrust",
  "untrusted-key": "diff.commitDetails.signatureUntrusted",
  "expired-signature": "diff.commitDetails.signatureExpired",
  "expired-key": "diff.commitDetails.signatureKeyExpired",
  "revoked-key": "diff.commitDetails.signatureKeyRevoked",
  "verification-error": "diff.commitDetails.signatureUnverified",
  "unsupported-format": "diff.commitDetails.signatureUnsupported",
};

export function commitSignatureLabel(signature: CommitSignatureVerification): string {
  if (signature.status === "unsigned") return t("diff.commitDetails.unsigned");
  if (signature.status === "verified") return t("diff.commitDetails.signatureVerified");
  if (signature.reasonCode) return t(reasons[signature.reasonCode]);
  return t("diff.commitDetails.signatureUnverified");
}

export function commitSignatureFormatLabel(signature: CommitSignatureVerification): string {
  const formats: Record<NonNullable<CommitSignatureVerification["format"]>, MessageKey> = {
    openpgp: "diff.commitDetails.signatureOpenPgp",
    ssh: "diff.commitDetails.signatureSsh",
    x509: "diff.commitDetails.signatureX509",
    unknown: "diff.commitDetails.signatureUnsupported",
  };
  return signature.format ? t(formats[signature.format]) : "";
}

export function commitSignatureTrustLabel(signature: CommitSignatureVerification): string {
  const levels: Record<NonNullable<CommitSignatureVerification["trustLevel"]>, MessageKey> = {
    undefined: "diff.commitDetails.trustUnknown",
    never: "diff.commitDetails.trustNever",
    marginal: "diff.commitDetails.trustMarginal",
    fully: "diff.commitDetails.trustFully",
    ultimate: "diff.commitDetails.trustUltimate",
  };
  return signature.trustLevel ? t(levels[signature.trustLevel]) : "";
}
