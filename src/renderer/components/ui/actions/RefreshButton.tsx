import { t } from "@shared/i18n";
import { AsyncButton } from "./AsyncButton";

export function RefreshButton({
  label = t("common.refresh"),
  onRefresh,
  disabled = false,
}: {
  label?: string;
  onRefresh: () => Promise<boolean>;
  disabled?: boolean;
}) {
  return (
    <AsyncButton
      label={label}
      title={label}
      onAction={onRefresh}
      disabled={disabled}
      size="icon-sm"
      variant="ghost"
    />
  );
}
