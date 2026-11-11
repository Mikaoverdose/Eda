import { t } from "@shared/i18n";
import type { CommitSignatureVerification } from "@shared/repository/repository-read";
import { KeyRoundIcon, ShieldOffIcon, SpinnerIcon } from "../icons";
import { commitSignatureLabel } from "./commit-signature-label";

export function commitSignatureTone(signature: CommitSignatureVerification | null) {
  switch (signature?.status) {
    case "verified":
      return "text-git-added";
    case "invalid":
      return "text-git-deleted";
    case "unverified":
      return "text-git-modified";
    default:
      return "text-text-tertiary";
  }
}

export function CommitSignatureIcon({
  signature,
  verifying = false,
  focusable = true,
}: {
  signature: CommitSignatureVerification | null;
  verifying?: boolean;
  focusable?: boolean;
}) {
  const label = verifying
    ? t("diff.commitDetails.checkingSignature")
    : signature
      ? commitSignatureLabel(signature)
      : t("diff.commitDetails.signatureUnverified");

  return (
    <span
      role="img"
      tabIndex={focusable ? 0 : undefined}
      aria-label={label}
      title={[label, signature?.signer, signature?.fingerprint ?? signature?.keyId]
        .filter(Boolean)
        .join("\n")}
      className={`flex shrink-0 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text ${commitSignatureTone(verifying ? null : signature)}`}
    >
      {verifying ? (
        <SpinnerIcon size={14} className="animate-spin-fast" aria-hidden="true" />
      ) : signature?.status === "unsigned" ? (
        <ShieldOffIcon size={14} aria-hidden="true" />
      ) : (
        <KeyRoundIcon size={14} aria-hidden="true" />
      )}
    </span>
  );
}
