import { t } from "@shared/i18n";
import { Button, type ButtonVariant } from "./Button";

export interface ReviewActionsProps {
  busy: boolean;
  onClose: () => void;
  onReview: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled: boolean;
  confirmVariant?: ButtonVariant;
  closeLabel?: string;
  closeVariant?: ButtonVariant;
  reviewLabel?: string;
  reviewDisabled?: boolean;
}

export function ReviewActions({
  busy,
  onClose,
  onReview,
  onConfirm,
  confirmLabel,
  confirmDisabled,
  confirmVariant = "primary",
  closeLabel = t("common.cancel"),
  closeVariant = "quiet",
  reviewLabel = t("reviewActions.reviewCurrentState"),
  reviewDisabled = false,
}: ReviewActionsProps) {
  return (
    <>
      <Button variant={closeVariant} disabled={busy} onClick={onClose}>
        {closeLabel}
      </Button>
      <Button disabled={busy || reviewDisabled} onClick={onReview}>
        {reviewLabel}
      </Button>
      <Button variant={confirmVariant} disabled={busy || confirmDisabled} onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </>
  );
}
