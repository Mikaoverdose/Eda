import { t } from "@shared/i18n";
import type { ReactNode } from "react";
import { Button, type ButtonVariant } from "./Button";

export interface DialogActionsProps {
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: ReactNode;
  busy?: boolean;
  confirmDisabled?: boolean;
  confirmVariant?: ButtonVariant;
  closeLabel?: string;
  closeVariant?: ButtonVariant;
  children?: ReactNode;
}

export function DialogActions({
  onClose,
  onConfirm,
  confirmLabel,
  busy = false,
  confirmDisabled = false,
  confirmVariant = "primary",
  closeLabel = t("common.cancel"),
  closeVariant = "quiet",
  children,
}: DialogActionsProps) {
  return (
    <>
      <Button variant={closeVariant} disabled={busy} onClick={onClose}>
        {closeLabel}
      </Button>
      {children}
      <Button variant={confirmVariant} busy={busy} disabled={confirmDisabled} onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </>
  );
}

export interface ReviewActionsProps extends Omit<DialogActionsProps, "children"> {
  busy: boolean;
  onReview: () => void;
  confirmDisabled: boolean;
  reviewLabel?: string;
  reviewDisabled?: boolean;
}

export function ReviewActions({
  busy,
  onReview,
  reviewLabel = t("reviewActions.reviewCurrentState"),
  reviewDisabled = false,
  ...props
}: ReviewActionsProps) {
  return (
    <DialogActions {...props} busy={busy}>
      <Button disabled={busy || reviewDisabled} onClick={onReview}>
        {reviewLabel}
      </Button>
    </DialogActions>
  );
}
