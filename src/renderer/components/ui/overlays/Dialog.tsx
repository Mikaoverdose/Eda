import { t } from "@shared/i18n";
import { useId, type ReactNode } from "react";
import { ModalDescription, ModalSurface, ModalTitle } from "./ModalSurface";
import { IconButton } from "../actions/Button";
import { CloseIcon } from "../icons";

export interface DialogProps {
  title: string;
  description?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  placement?: "center" | "right";
  wide?: boolean;
  size?: "md" | "lg" | "xl";
}

export function Dialog({
  title,
  description,
  onClose,
  footer,
  children,
  placement = "center",
  wide = false,
  size = "md",
}: DialogProps) {
  const descriptionId = useId();
  const placementWidth = placement === "right" ? "w-full" : "w-[calc(100vw-2rem)]";
  const maxWidth = wide
    ? "max-w-[76rem]"
    : size === "xl"
      ? "max-w-[60rem]"
      : size === "lg"
        ? "max-w-[40rem]"
        : "max-w-[30rem]";
  const height = placement === "right" ? "min-h-0" : "max-h-[90vh] rounded-lg";

  return (
    <ModalSurface
      onClose={onClose}
      placement={placement}
      descriptionId={description ? descriptionId : undefined}
      className={`${placementWidth} ${maxWidth} overflow-y-auto border border-border-default p-6 ${height}`}
    >
      <div className="flex items-start justify-between gap-4">
        <ModalTitle className="min-w-0 text-xl font-semibold tracking-tight">{title}</ModalTitle>
        <IconButton
          aria-label={t("dialog.closeDialog")}
          title={t("dialog.closeEsc")}
          className="-mr-1 -mt-1"
          icon={<CloseIcon size={16} />}
          onClick={onClose}
        />
      </div>
      {description && (
        <ModalDescription
          id={descriptionId}
          className="mt-1 text-sm leading-normal text-text-secondary"
        >
          {description}
        </ModalDescription>
      )}
      <div className="mt-4">{children}</div>
      {footer && (
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
          {footer}
        </div>
      )}
    </ModalSurface>
  );
}
