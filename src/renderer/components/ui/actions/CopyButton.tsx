import { t } from "@shared/i18n";
import { Copy } from "lucide-react";
import { AsyncButton } from "./AsyncButton";
import { copyText } from "../../../utils/clipboard";

export function CopyButton({
  value,
  copied = false,
  label = t("common.copy"),
}: {
  value: string;
  copied?: boolean;
  label?: string;
}) {
  const copy = async () => {
    await copyText(value);
    return true;
  };

  return (
    <AsyncButton
      key={value}
      size="icon-sm"
      variant="ghost"
      label={label}
      title={label}
      completed={copied}
      onAction={copy}
      icon={<Copy size={14} aria-hidden="true" />}
    />
  );
}
