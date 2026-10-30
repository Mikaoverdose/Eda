import { t } from "@shared/i18n";
import { useState } from "react";
import type { Identity } from "@shared/identity/identity";
import { useAppStore } from "../../stores/app-store";
import { IdentityDialog } from "./IdentityDialog";
import { Button, ErrorDialog } from "../../components/ui/index";
import { useSessionStore } from "../../stores/session-store";
import type { ProfileDeletePreview } from "@shared/identity/profile-session";
import { Plus, Check } from "lucide-react";
import { DuplicateProfile } from "./DuplicateProfile";
import { DeleteProfile } from "./DeleteProfile";
import { ProfileAvatar } from "../../components/ui/display/ProfileAvatar";

export function ProfilesSettings() {
  const profiles = useAppStore((state) => state.identities);
  const active = useAppStore((state) => state.activeIdentity);
  const switching = useAppStore((state) => state.switchingIdentityId);
  const [editing, setEditing] = useState<Identity | "new" | null>(null);
  const [duplicating, setDuplicating] = useState<Identity | null>(null);
  const [deleting, setDeleting] = useState<ProfileDeletePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = async (id: string) => {
    if (!(await useSessionStore.getState().flush())) return;
    const result = await window.eda.identity.previewDelete(id);
    if (result.ok) {
      setError(null);
      setDeleting(result.value);
    } else setError(result.error.message);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-tertiary">
          {t("profilesSettings.profileCount", { count: profiles.length })}
        </span>
        <Button
          size="sm"
          variant="primary"
          icon={<Plus size={14} />}
          disabled={switching !== null}
          onClick={() => setEditing("new")}
        >
          {t("profilesSettings.newProfile")}
        </Button>
      </div>
      <div>
        <div
          aria-hidden="true"
          className="profile-list-heading profile-list-row text-xs text-text-tertiary"
        >
          <span>{t("profilesSettings.profile")}</span>
          <span>{t("profilesSettings.commitAuthor")}</span>
          <span>{t("profilesSettings.status")}</span>
          <span className="text-right">{t("profilesSettings.actions")}</span>
        </div>
        {profiles.map((profile) => (
          <div
            key={profile.id}
            data-testid={`profile-${profile.id}`}
            className="profile-list-row border-b border-border-subtle py-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <ProfileAvatar name={profile.name} hue={profile.hue} email={profile.gitEmail} small />
              <p className="truncate text-sm font-medium" title={profile.name}>
                {profile.name}
              </p>
            </div>
            <div className="profile-list-author min-w-0">
              <p className="truncate text-sm text-text-secondary" title={profile.gitName}>
                {profile.gitName}
              </p>
              <p className="mt-0.5 truncate text-xs text-text-tertiary" title={profile.gitEmail}>
                {profile.gitEmail}
              </p>
            </div>
            <div className="profile-list-status">
              {active?.id === profile.id ? (
                <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Check size={13} className="text-accent-text" aria-hidden="true" />
                  {t("profilesSettings.active")}
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={switching !== null}
                  onClick={() => void useAppStore.getState().setActiveIdentity(profile.id)}
                >
                  {t("profilesSettings.switch")}
                </Button>
              )}
            </div>
            <div className="profile-list-actions flex justify-end gap-0.5">
              <Button
                size="sm"
                variant="quiet"
                disabled={switching !== null}
                onClick={() => setEditing(profile)}
              >
                {t("common.edit")}
              </Button>
              <Button
                size="sm"
                variant="quiet"
                disabled={switching !== null}
                onClick={() => setDuplicating(profile)}
              >
                {t("profilesSettings.duplicate")}
              </Button>
              <Button
                size="sm"
                variant="quiet"
                className="hover:not-disabled:bg-git-deleted/10 hover:not-disabled:text-git-deleted"
                disabled={switching !== null}
                onClick={() => void preview(profile.id)}
              >
                {t("common.delete")}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      {editing && (
        <IdentityDialog
          {...(editing === "new" ? {} : { identity: editing })}
          onClose={() => setEditing(null)}
        />
      )}
      {duplicating && (
        <DuplicateProfile profile={duplicating} onClose={() => setDuplicating(null)} />
      )}
      {deleting && (
        <DeleteProfile
          preview={deleting}
          onClose={() => setDeleting(null)}
          onRefresh={() => void preview(deleting.profileId)}
        />
      )}
    </div>
  );
}
