import { t } from "@shared/i18n";
import { Children, isValidElement, useEffect, useState, type ReactNode } from "react";
import { Dialog } from "./Dialog";
import { Button } from "../actions/Button";

function messageText(content: ReactNode): string {
  return Children.toArray(content)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? messageText(child.props.children)
        : String(child),
    )
    .join(" ");
}

export function ErrorDialog({
  children,
  title = t("errorDialog.couldNotCompleteTheAction"),
  onDismiss,
  actions,
}: {
  children: ReactNode;
  title?: string;
  onDismiss?: () => void;
  actions?: ReactNode;
}) {
  const [dismissed, setDismissed] = useState(false);
  const message = messageText(children);

  useEffect(() => setDismissed(false), [message]);

  if (!children || dismissed) return null;

  const close = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <Dialog
      title={title}
      onClose={close}
      footer={
        <>
          {actions}
          <Button onClick={close}>{t("errorDialog.dismiss")}</Button>
        </>
      }
    >
      <div role="alert" className="break-words text-sm leading-relaxed text-text-secondary">
        {children}
      </div>
    </Dialog>
  );
}
