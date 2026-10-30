import { t } from "@shared/i18n";
import { ErrorDialog } from "../../components/ui/index";
import { ButtonBase } from "../../components/ui/actions/ButtonBase";
import { useState } from "react";
import { useAppStore } from "../../stores/app-store";
import { Button, Dialog, Field, Input, Textarea } from "../../components/ui/index";
import { builtInSetting } from "@shared/preferences/settings";
import type { Identity } from "@shared/identity/identity";

export function IdentityDialog({
  onClose,
  identity,
}: {
  onClose: () => void;
  identity?: Identity;
}) {
  const createIdentity = useAppStore((s) => s.createIdentity);
  const updateIdentity = useAppStore((s) => s.updateIdentity);
  const error = useAppStore((s) => s.error);
  const [name, setName] = useState(identity?.name ?? "");
  const [gitName, setGitName] = useState(identity?.gitName ?? "");
  const [gitEmail, setGitEmail] = useState(identity?.gitEmail ?? "");
  const [rules, setRules] = useState(identity?.rules.join("\n") ?? "");
  const [saving, setSaving] = useState(false);
  const [touchedEmail, setTouchedEmail] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gitEmail);
  const canSave = name.trim() !== "" && gitName.trim() !== "" && emailValid;

  const save = async () => {
    if (!canSave || saving) return;

    setSaving(true);

    const fields = {
      name: name.trim(),
      gitName: gitName.trim(),
      gitEmail: gitEmail.trim(),
      rules: rules
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    };

    try {
      const saved = identity
        ? await updateIdentity(identity.id, fields)
        : await createIdentity({
            ...fields,
            hue: builtInSetting("accentHue").value,
            signing: { format: "none", signCommits: false },
          });

      if (saved) onClose();
    } catch (error) {
      useAppStore.setState({
        error: { kind: "unknown", operation: t("operations.saveProfile"), message: String(error) },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={identity ? t("identityDialog.editProfile") : t("identityDialog.newProfile")}
      description={t("identityDialog.profilesKeepYourGitAuthorCredentialsPreferencesAnd")}
      onClose={() => {
        if (!saving) onClose();
      }}
      footer={
        <>
          <Button variant="quiet" disabled={saving} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="identity" busy={saving} disabled={!canSave} onClick={() => void save()}>
            {saving
              ? t("identityDialog.saving")
              : identity
                ? t("identityDialog.saveProfile")
                : t("identityDialog.createProfile")}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field
          label={t("identityDialog.profileName")}
          hint={t("identityDialog.whatYouCallThisContextLikeWorkOrOpenSource")}
        >
          {(props) => (
            <Input
              {...props}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("identityDialog.work")}
            />
          )}
        </Field>

        <Field
          label={t("identityDialog.gitName")}
          hint={t("identityDialog.theAuthorNameOnYourCommits")}
        >
          {(props) => (
            <Input
              {...props}
              value={gitName}
              onChange={(e) => setGitName(e.target.value)}
              placeholder={t("identityDialog.eda")}
            />
          )}
        </Field>

        <Field
          label={t("identityDialog.gitEmail")}
          hint={t("identityDialog.theAuthorEmailOnYourCommits")}
          error={
            touchedEmail && gitEmail !== "" && !emailValid
              ? t("identityDialog.enterACompleteEmailAddress")
              : undefined
          }
        >
          {(props) => (
            <Input
              {...props}
              mono
              type="email"
              value={gitEmail}
              onChange={(e) => setGitEmail(e.target.value)}
              onBlur={() => setTouchedEmail(true)}
              invalid={touchedEmail && gitEmail !== "" && !emailValid}
              placeholder={t("identityDialog.edaExampleCom")}
            />
          )}
        </Field>

        <Field
          label={t("identityDialog.repositoryPathRules")}
          hint={t("identityDialog.onePathPatternPerLineSuchAsWork")}
        >
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={rules}
              onChange={(event) => setRules(event.target.value)}
            />
          )}
        </Field>

        {error && <ErrorDialog>{error.message}</ErrorDialog>}

        <ButtonBase type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}
