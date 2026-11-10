import type { ReactNode } from "react";
import { GlobeIcon, MapPinIcon } from "../../components/ui/icons";
import type { AccentColor } from "@shared/preferences/accent";
import { ConnectionAccount } from "./ConnectionAccount";

function ProfileDetail({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-text-tertiary">
      <span className="mt-0.5 flex shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </p>
  );
}

export function ConnectionProfile({
  login,
  name,
  bio,
  location,
  instanceUrl,
  avatarDataUrl,
  hue,
  profileLabel,
  onOpenProfile,
  children,
  connected = true,
  disabled = false,
}: {
  login: string;
  name?: string | null | undefined;
  bio?: string | null | undefined;
  location?: string | null | undefined;
  instanceUrl?: string;
  avatarDataUrl?: string | null | undefined;
  hue: AccentColor;
  profileLabel: string;
  onOpenProfile: () => void;
  children?: ReactNode;
  connected?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <ConnectionAccount
        login={login}
        name={name?.trim() || login}
        avatarDataUrl={avatarDataUrl}
        hue={hue}
        connected={connected}
        disabled={disabled}
        profileLabel={profileLabel}
        onOpen={onOpenProfile}
      />

      {bio && <p className="whitespace-pre-line break-words text-xs text-text-secondary">{bio}</p>}

      {location && <ProfileDetail icon={<MapPinIcon size={14} />}>{location}</ProfileDetail>}

      {instanceUrl && <ProfileDetail icon={<GlobeIcon size={14} />}>{instanceUrl}</ProfileDetail>}

      {children}
    </div>
  );
}
