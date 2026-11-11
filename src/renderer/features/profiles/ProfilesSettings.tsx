import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { Identity } from "@shared/identity/identity";
import type { ProfileDeletePreview } from "@shared/identity/profile-session";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  CheckIcon as Check,
  PlusIcon as Plus,
} from "../../components/ui/icons";
import { useState } from "react";
import { ProfileAvatar } from "../../components/ui/display/ProfileAvatar";
import { Button, IconButton, ErrorDialog } from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";
import { useSessionStore } from "../../stores/session-store";
import { DeleteProfile } from "./DeleteProfile";
import { DuplicateProfile } from "./DuplicateProfile";
import { IdentityDialog } from "./IdentityDialog";

export function ProfilesSettings() {
  const profiles = useAppStore((state) => state.identities);
  const active = useAppStore((state) => state.activeIdentity);
  const switching = useAppStore((state) => state.switchingIdentityId);
  const [reordering, setReordering] = useState(false);
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
    } else setError(errorMessage(result.error));
  };

  const move = async (id: string, offset: number) => {
    if (reordering || switching !== null) return;

    const ids = profiles.map((profile) => profile.id);
    const index = ids.indexOf(id);
    const target = index + offset;

    if (index < 0 || target < 0 || target >= ids.length) return;

    ids.splice(index, 1);
    ids.splice(target, 0, id);
    setReordering(true);

    try {
      const result = await window.eda.identity.reorder(ids);

      if (result.ok) {
        useAppStore.setState({ identities: result.value });
        setError(null);
      } else {
        setError(errorMessage(result.error));
        await useAppStore.getState().refreshIdentities();
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setReordering(false);
    }
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
          disabled={switching !== null || reordering}
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
        {profiles.map((profile, index) => (
          <div
            key={profile.id}
            data-testid={`profile-${profile.id}`}
            className="profile-list-row border-b border-border-subtle py-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              {profiles.length > 1 && (
                <div className="flex shrink-0 flex-col">
                  <IconButton
                    size="xs"
                    icon={<ArrowUpIcon size={12} />}
                    aria-label={t("profilesSettings.moveUp", { name: profile.name })}
                    disabled={switching !== null || reordering || index === 0}
                    onClick={() => void move(profile.id, -1)}
                  />
                  <IconButton
                    size="xs"
                    icon={<ArrowDownIcon size={12} />}
                    aria-label={t("profilesSettings.moveDown", { name: profile.name })}
                    disabled={switching !== null || reordering || index === profiles.length - 1}
                    onClick={() => void move(profile.id, 1)}
                  />
                </div>
              )}
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
                  disabled={switching !== null || reordering}
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
                disabled={switching !== null || reordering}
                onClick={() => setEditing(profile)}
              >
                {t("common.edit")}
              </Button>
              <Button
                size="sm"
                variant="quiet"
                disabled={switching !== null || reordering}
                onClick={() => setDuplicating(profile)}
              >
                {t("profilesSettings.duplicate")}
              </Button>
              <Button
                size="sm"
                variant="quiet"
                className="hover:not-disabled:bg-git-deleted/10 hover:not-disabled:text-git-deleted"
                disabled={switching !== null || reordering}
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
