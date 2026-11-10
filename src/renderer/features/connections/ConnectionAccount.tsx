import { t } from "@shared/i18n";
import type { AccentColor } from "@shared/preferences/accent";
import { ProfileAvatar } from "../../components/ui/display/ProfileAvatar";
import { TextButton } from "../../components/ui/index";
import { cx } from "../../components/ui/cx";

export function ConnectionAccount({
  login,
  name,
  avatarDataUrl,
  hue,
  connected,
  profileLabel,
  avatarName,
  disabled = false,
  onOpen,
}: {
  login: string;
  name?: string | null | undefined;
  avatarDataUrl?: string | null | undefined;
  hue: AccentColor;
  connected: boolean;
  profileLabel: string;
  avatarName?: string;
  disabled?: boolean;
  onOpen(): void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <ProfileAvatar
        name={avatarName ?? name ?? login}
        hue={hue}
        imageUrl={avatarDataUrl ?? undefined}
      />

      <div className="min-w-0">
        {name && (
          <p title={name} className="truncate text-sm font-medium text-text-primary">
            {name}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <TextButton
            onClick={onOpen}
            aria-label={profileLabel}
            disabled={disabled}
            className={cx(
              "max-w-full truncate text-left",
              !name && "text-sm font-medium text-text-primary",
            )}
          >
            @{login}
          </TextButton>

          {!connected && (
            <p role="status" className="text-xs text-git-modified">
              {t("settings.connections.reconnectRequired")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
