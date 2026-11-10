import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { t } from "@shared/i18n";
import type { AccentColor } from "@shared/preferences/accent";
import { ConnectionAccount } from "./ConnectionAccount";

export function GitHubProfile({
  login,
  name,
  bio,
  location,
  avatarDataUrl,
  hue,
  onOpenProfile,
  children,
  connected = true,
}: {
  login: string;
  name?: string | null | undefined;
  bio?: string | null | undefined;
  location?: string | null | undefined;
  avatarDataUrl?: string | null | undefined;
  hue: AccentColor;
  onOpenProfile: () => void;
  children?: ReactNode;
  connected?: boolean;
}) {
  return (
    <div className="space-y-2">
      <ConnectionAccount
        login={login}
        name={name}
        avatarDataUrl={avatarDataUrl}
        hue={hue}
        connected={connected}
        profileLabel={t("settings.gitHubConnection.viewOnGitHub", { login })}
        onOpen={onOpenProfile}
      />

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
