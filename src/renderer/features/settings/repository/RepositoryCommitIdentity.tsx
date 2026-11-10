import { t } from "@shared/i18n";
import { useState } from "react";
import { isCommitIdentity } from "@shared/identity/identity";
import { useAppStore } from "../../../stores/app-store";
import { usePreferencesStore } from "../../../stores/preferences-store";
import { AsyncButton, Button, ErrorDialog, Field, Input } from "../../../components/ui/index";
import { useScopedSetting } from "../hooks/useScopedSetting";

export function RepositoryCommitIdentity() {
  const profile = useAppStore((state) => state.activeIdentity);
  const repositoryId = useAppStore((state) => state.selectedRepositoryId);
  const setting = useScopedSetting(
    "repositoryCommitIdentity",
    "repository",
    repositoryId ?? undefined,
  );
  const saving = usePreferencesStore((state) => state.saving);
  const [error, setError] = useState<string | null>(null);
  if (!profile || !repositoryId) return null;
  const identity = setting.resolved.value ?? { name: profile.gitName, email: profile.gitEmail };

  return (
    <section className="space-y-3 border-b border-border-subtle pb-5">
      <h2 className="text-sm font-medium">
        {t("settings.repositoryCommitIdentity.edaCommitIdentity")}
      </h2>
      <p className="text-xs text-text-secondary">
        {t("settings.repositoryCommitIdentity.externalGitConfigurationChangesDoNotChangeThe", {
          value1: setting.resolved.value
            ? t(
                "settings.repositoryCommitIdentity.thisSavedRepositoryIdentityOverridesTheProfileSAuthorNameAndEmail",
              )
            : t("settings.repositoryCommitIdentity.followingTheProfileSAuthorNameAndEmail", {
                name: profile.name,
              }),
        })}
      </p>
      <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      <form
        key={JSON.stringify([profile.id, repositoryId, identity])}
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const fields = new FormData(form);
          const value = {
            name: String(fields.get("name") ?? "").trim(),
            email: String(fields.get("email") ?? "").trim(),
          };
          if (!isCommitIdentity(value)) {
            setError(t("settings.repositoryCommitIdentity.enterAValidAuthorNameAndEmailWithout"));
            return;
          }
          void setting.set(value).then((saved) => {
            if (saved) setError(null);
            else
              setError(
                t("settings.repositoryCommitIdentity.couldNotSaveThisRepositoryIdentityTryAgain"),
              );
          });
        }}
      >
        <fieldset disabled={setting.unavailable || saving} className="space-y-3">
          <Field label={t("settings.repositoryCommitIdentity.commitAuthorName")}>
            {(props) => (
              <Input {...props} name="name" defaultValue={identity.name} required maxLength={128} />
            )}
          </Field>
          <Field label={t("settings.repositoryCommitIdentity.commitAuthorEmail")}>
            {(props) => (
              <Input
                {...props}
                name="email"
                type="email"
                defaultValue={identity.email}
                required
                maxLength={254}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit">
              {t("settings.repositoryCommitIdentity.saveRepositoryIdentity")}
            </Button>
            {setting.resolved.value && (
              <AsyncButton
                size="sm"
                variant="ghost"
                label={t("settings.repositoryCommitIdentity.useProfileIdentity")}
                onAction={async () => {
                  const saved = await setting.reset();
                  setError(
                    saved
                      ? null
                      : t(
                          "settings.repositoryCommitIdentity.couldNotRestoreTheProfileIdentityTryAgain",
                        ),
                  );
                  return saved;
                }}
              >
                {t("settings.repositoryCommitIdentity.useProfileIdentity")}
              </AsyncButton>
            )}
          </div>
        </fieldset>
      </form>
    </section>
  );
}
