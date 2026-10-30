import { t } from "@shared/i18n";
import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { profileGitConfig, type Identity } from "@shared/identity/identity";
import type { GitConfigEntry } from "@shared/identity/profile-session";
import { useAppStore } from "../stores/app-store";
import { usePreferencesStore } from "../stores/preferences-store";
import {
  AsyncButton,
  Button,
  ComparisonTable,
  DefinitionList,
  Dialog,
  Disclosure,
  NoticeBanner,
} from "../components/ui/index";

export function GlobalGitWarning({ onReview }: { onReview: () => void }) {
  const profile = useAppStore((state) => state.activeIdentity);
  const switching = useAppStore((state) => state.switchingIdentityId);
  const enabled = usePreferencesStore((state) => state.values.syncGlobalGitConfig.value);
  const owner = usePreferencesStore((state) => state.context.profileId);

  if (!profile || switching || !enabled || owner !== profile.id) return null;

  return (
    <GlobalGitStatus
      key={JSON.stringify([profile.id, profile.gitName, profile.gitEmail, profile.signing])}
      profile={profile}
      onReview={onReview}
    />
  );
}

function GlobalGitStatus({ profile, onReview }: { profile: Identity; onReview: () => void }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<GitConfigEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const reading = useRef(0);
  const applyingRef = useRef(false);
  const refreshRef = useRef<() => Promise<boolean>>(async () => false);
  const expected = profileGitConfig(profile);
  const differences = entries?.filter((entry) => entry.value !== expected[entry.key]) ?? [];

  useEffect(() => {
    mounted.current = true;
    const refresh = async () => {
      const request = ++generation.current;
      reading.current++;
      try {
        const result = await window.eda.identity.inspectGit();
        if (!mounted.current || request !== generation.current) return false;
        if (!result.ok) {
          setError(result.error.message);
          return false;
        }
        if (result.value.profileId !== profile.id) return false;
        setEntries(result.value.global);
        setError(null);
        const expected = profileGitConfig(profile);
        const matches = result.value.global.every((entry) => entry.value === expected[entry.key]);
        if (matches) setApplyError(null);
        return matches;
      } catch {
        if (mounted.current && request === generation.current)
          setError(t("globalGitWarning.couldNotReadGlobalGitSettingsTryCheckingAgain"));
        return false;
      } finally {
        reading.current--;
      }
    };
    refreshRef.current = refresh;
    const check = () => {
      if (document.visibilityState !== "hidden" && !reading.current && !applyingRef.current)
        void refresh();
    };
    void refresh();
    const timer = window.setInterval(check, 5_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      mounted.current = false;
      generation.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [profile]);

  const apply = async () => {
    if (applyingRef.current) return false;
    applyingRef.current = true;
    setApplying(true);
    setApplyError(null);
    generation.current++;
    try {
      const result = await window.eda.identity.reapplyGlobal(profile.id);
      if (!mounted.current) return false;
      if (!result.ok) {
        setApplyError(result.error.message);
        return false;
      }
      const matches = await refreshRef.current();
      if (mounted.current && !matches)
        setApplyError(
          t("globalGitWarning.globalGitSettingsStillDifferReviewTheirSourceFilesAndTryAgain"),
        );
      return matches;
    } catch {
      if (mounted.current)
        setApplyError(t("globalGitWarning.couldNotApplyGlobalGitSettingsTryAgain"));
      return false;
    } finally {
      applyingRef.current = false;
      if (mounted.current) setApplying(false);
    }
  };

  if (!differences.length && !error && !applyError) return null;

  return (
    <aside
      aria-label={t("globalGitWarning.globalGitConfigurationWarning")}
      className="relative flex h-8 shrink-0 items-center gap-2 border-b border-git-modified/20 bg-git-modified/5 px-3 text-xs"
    >
      <TriangleAlert size={13} aria-hidden="true" className="shrink-0 text-git-modified" />
      <span role="status" className="min-w-0 flex-1 truncate text-text-secondary">
        {applyError
          ? t("globalGitWarning.couldNotUpdateGlobalGitSettings")
          : error
            ? t("globalGitWarning.couldNotCheckGlobalGitSettings")
            : t("globalGitWarning.globalGitSettingsDifferFrom", { name: profile.name })}
      </span>
      <Button
        size="sm"
        variant="quiet"
        aria-label={t("globalGitWarning.reviewGlobalGitSettings")}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {t("globalGitWarning.review")}
      </Button>
      {open && (
        <Dialog
          size="lg"
          title={t("globalGitWarning.reviewGlobalGitSettings")}
          description={t("globalGitWarning.globalGitSyncIsEnabledForReviewThe", {
            name: profile.name,
          })}
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button
                variant="ghost"
                className="mr-auto"
                onClick={() => {
                  setOpen(false);
                  onReview();
                }}
              >
                {t("globalGitWarning.globalGitSettings")}
              </Button>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {t("common.close")}
              </Button>
              <AsyncButton
                label={t("globalGitWarning.applyProfileGlobally")}
                variant="primary"
                disabled={applying}
                onAction={apply}
              >
                {t("globalGitWarning.applyProfileGlobally")}
              </AsyncButton>
            </>
          }
        >
          <div className="space-y-5">
            {(error || applyError) && (
              <NoticeBanner
                tone="error"
                action={
                  <AsyncButton
                    size="sm"
                    label={t("globalGitWarning.checkGlobalGitSettings")}
                    variant="ghost"
                    disabled={applying}
                    onAction={() => refreshRef.current()}
                  >
                    {t("globalGitWarning.checkAgain")}
                  </AsyncButton>
                }
              >
                {applyError || error}
              </NoticeBanner>
            )}
            {!!differences.length && (
              <section aria-label={t("globalGitWarning.changesToApply")} className="space-y-3">
                <h3 className="text-sm font-medium">{t("globalGitWarning.changesToApply")}</h3>
                <ComparisonTable
                  label={t("globalGitWarning.changesToApply")}
                  fieldLabel={t("globalGitWarning.setting")}
                  beforeLabel={t("globalGitWarning.currentGit")}
                  afterLabel={t("globalGitWarning.profile", { name: profile.name })}
                  rows={differences.map((entry) => ({
                    id: entry.key,
                    label: settingLabel(entry.key),
                    before: settingValue(entry.key, entry.value),
                    after: settingValue(entry.key, expected[entry.key]),
                  }))}
                />
              </section>
            )}
            <NoticeBanner>
              {t("globalGitWarning.applyingThisProfileUpdatesGlobalGitSettingsUsed")}
            </NoticeBanner>
            {!!differences.length && (
              <Disclosure title={t("globalGitWarning.configurationSources")}>
                <div className="mt-3">
                  <DefinitionList
                    items={differences.map((entry) => ({
                      label: entry.key,
                      value: entry.origin ?? t("globalGitWarning.noGlobalValue"),
                    }))}
                  />
                </div>
              </Disclosure>
            )}
          </div>
        </Dialog>
      )}
    </aside>
  );
}

function settingLabel(key: string): string {
  return (
    {
      "user.name": t("globalGitWarning.authorName"),
      "user.email": t("common.email"),
      "gpg.format": t("globalGitWarning.signingFormat"),
      "user.signingkey": t("globalGitWarning.signingKey"),
      "commit.gpgsign": t("globalGitWarning.signCommits"),
    }[key] ?? key
  );
}

function settingValue(key: string, value: string | undefined): string {
  if (value === undefined) return t("globalGitWarning.notConfigured");
  if (key === "commit.gpgsign") {
    if (/^(true|yes|on|1)?$/i.test(value)) return t("globalGitWarning.on");
    if (/^(false|no|off|0)$/i.test(value)) return t("globalGitWarning.off");
  }
  if (key === "gpg.format")
    return value === "ssh"
      ? t("globalGitWarning.ssh")
      : value === "openpgp"
        ? t("globalGitWarning.gpg")
        : value;
  return value;
}
