import { t } from "@shared/i18n";
import { useRef, useState } from "react";
import type { Identity } from "@shared/identity/identity";
import { useAppStore } from "../../stores/app-store";
import {
  CheckIcon,
  IdentityIcon,
  PlusIcon,
  cx,
  MenuItem,
  AnchoredPopover,
  ProfileButton,
} from "../../components/ui/index";
import { ProfileAvatar } from "../../components/ui/display/ProfileAvatar";

export function IdentitySwitcher({
  onAddIdentity,
  onManageProfiles,
}: {
  onAddIdentity: () => void;
  onManageProfiles: () => void;
}) {
  const identities = useAppStore((s) => s.identities);
  const active = useAppStore((s) => s.activeIdentity);
  const switching = useAppStore((s) => s.switchingIdentityId);
  const setActive = useAppStore((s) => s.setActiveIdentity);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  if (!active)
    return (
      <ProfileButton
        aria-label={t("identitySwitcher.chooseAProfile")}
        title={t("identitySwitcher.chooseAProfile")}
        onClick={onManageProfiles}
      >
        <IdentityIcon size={18} aria-hidden="true" />
      </ProfileButton>
    );

  const select = (identity: Identity) => {
    setOpen(false);
    if (identity.id !== active.id) void setActive(identity.id);
  };

  return (
    <div data-tour="profile" className="relative">
      <ProfileButton
        ref={trigger}
        profileName={active.name}
        onClick={() => setOpen((v) => !v)}
        disabled={switching !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("identitySwitcher.activeProfileSwitchProfile", {
          name: active.name,
          gitEmail: active.gitEmail,
        })}
        title={`${active.name}: ${active.gitEmail}`}
      >
        <ProfileAvatar name={active.name} hue={active.hue} email={active.gitEmail} small />
      </ProfileButton>

      {open && (
        <AnchoredPopover
          role="menu"
          onClose={() => setOpen(false)}
          anchorRef={trigger}
          placement="bottom-end"
          className="w-[18rem]"
        >
          <div className="border-b border-border-subtle px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              {t("identitySwitcher.switchProfile")}
            </p>
            <p className="mt-0.5 truncate text-xs text-text-secondary">{active.gitEmail}</p>
          </div>

          <div className="p-1">
            {identities.map((identity) => (
              <IdentityOption
                key={identity.id}
                identity={identity}
                isActive={identity.id === active.id}
                onSelect={() => select(identity)}
              />
            ))}
          </div>

          <div className="border-t border-border-subtle p-1">
            <MenuItem
              onClick={() => {
                setOpen(false);
                onAddIdentity();
              }}
              className="py-2 text-sm"
            >
              <PlusIcon size={14} />
              {t("identitySwitcher.newProfile")}
            </MenuItem>

            <MenuItem
              onClick={() => {
                setOpen(false);
                onManageProfiles();
              }}
              className="py-2 text-sm"
            >
              {t("identitySwitcher.manageProfiles")}
            </MenuItem>
          </div>
        </AnchoredPopover>
      )}
    </div>
  );
}

function IdentityOption({
  identity,
  isActive,
  onSelect,
}: {
  identity: Identity;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <MenuItem
      onClick={onSelect}
      aria-current={isActive ? "true" : undefined}
      className={cx("gap-2.5 py-2 text-sm", isActive ? "bg-accent-muted" : "hover:bg-bg-raised")}
    >
      <ProfileAvatar name={identity.name} hue={identity.hue} email={identity.gitEmail} small />

      <span className="min-w-0 flex-1">
        <span
          className={cx(
            "block truncate text-sm font-[550]",
            isActive ? "text-accent-text" : "text-text-primary",
          )}
        >
          {identity.name}
        </span>

        <span className="mono block truncate text-xs text-text-tertiary">{identity.gitEmail}</span>
      </span>

      {isActive && (
        <span aria-hidden="true" className="shrink-0 text-accent-text">
          <CheckIcon size={14} />
        </span>
      )}
    </MenuItem>
  );
}
