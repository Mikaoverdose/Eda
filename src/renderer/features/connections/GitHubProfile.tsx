import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { t } from "@shared/i18n";
import type { AccentColor } from "@shared/preferences/accent";
import { ProfileAvatar } from "../../components/ui/display/ProfileAvatar";
import { TextButton } from "../../components/ui/index";

export function GitHubProfile({
  login,
  name,
  bio,
  location,
  avatarDataUrl,
  hue,
  onOpenProfile,
  children,
}: {
  login: string;
  name?: string | null | undefined;
  bio?: string | null | undefined;
  location?: string | null | undefined;
  avatarDataUrl?: string | null | undefined;
  hue: AccentColor;
  onOpenProfile: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center gap-3">
        <ProfileAvatar name={name ?? login} hue={hue} imageUrl={avatarDataUrl ?? undefined} />

        <div className="min-w-0">
          {name && <p className="break-words text-sm font-medium">{name}</p>}

          <TextButton
            onClick={onOpenProfile}
            aria-label={t("settings.gitHubConnection.viewOnGitHub", { login })}
            className="max-w-full whitespace-normal text-left [overflow-wrap:anywhere]"
          >
            @{login}
          </TextButton>
        </div>
      </div>

      {bio && <p className="whitespace-pre-line break-words text-xs text-text-secondary">{bio}</p>}

      {location && (
        <p className="flex items-start gap-1.5 text-xs text-text-tertiary">
          <MapPin size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{location}</span>
        </p>
      )}

      {children}
    </div>
  );
}
