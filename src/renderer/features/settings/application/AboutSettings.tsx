import { t } from "@shared/i18n";
import { MAINTAINER_GITHUB_LOGIN, type GitHubAccountProfile } from "@shared/integrations/github";
import { UPDATE_DOWNLOAD_PAGE } from "@shared/updates";
import { ExternalLink, Heart, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, CopyButton, ExternalLinkButton, Skeleton } from "../../../components/ui/index";
import { GitHubProfile } from "../../connections/GitHubProfile";
import { ProviderIcon } from "../../connections/ProviderIcon";
import { UpdatesSettings } from "../../updates/UpdatesSettings";

const maintainer = MAINTAINER_GITHUB_LOGIN;
const emailUser = "yuzu";
const emailBase = "kirameki.cafe";
const maintainerEmail = [emailUser, emailBase].join("@");
const repositoryUrl = `https://github.com/${maintainer}/Eda`;

export function AboutSettings() {
  const build = window.eda.app.version;
  const [profile, setProfile] = useState<GitHubAccountProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    let active = true;

    void window.eda.github
      .maintainerProfile()
      .then((result) => {
        if (active && result.ok) setProfile(result.value);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingProfile(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="max-w-2xl space-y-8">
      <section aria-labelledby="about-eda-heading" className="space-y-4">
        <div>
          <h2 id="about-eda-heading" className="text-2xl font-semibold tracking-tight">
            {t("settings.aboutSettings.eda")}
          </h2>

          <p className="mt-2 text-sm text-text-secondary">
            {t("settings.aboutSettings.aModernOpenSourceGitClient")}
          </p>
        </div>

        <dl className="flex flex-wrap gap-x-8 gap-y-3 rounded-md border border-border-subtle bg-bg-surface px-3 py-2.5 text-xs">
          <div className="min-w-0">
            <dt className="text-text-tertiary">{t("settings.aboutSettings.version")}</dt>
            <dd className="flex min-h-8 items-center gap-1">
              <span className="selectable min-w-0 font-mono [overflow-wrap:anywhere]">
                {build.displayVersion}
              </span>

              <CopyButton
                value={build.displayVersion}
                label={t("settings.aboutSettings.copyEdaVersion")}
              />
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="text-text-tertiary">{t("settings.aboutSettings.commit")}</dt>
            <dd className="flex min-h-8 items-center gap-1">
              {build.commit ? (
                <>
                  <span className="selectable font-mono" title={build.commit}>
                    {build.commit.slice(0, 12)}
                  </span>

                  <CopyButton
                    value={build.commit}
                    label={t("settings.aboutSettings.copyBuildCommit")}
                  />
                </>
              ) : (
                <span className="text-text-secondary">{t("aboutSettings.unavailable")}</span>
              )}
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="text-text-tertiary">{t("settings.aboutSettings.sourceState")}</dt>
            <dd
              className="flex min-h-8 items-center"
              title={
                build.dirty === null
                  ? t("settings.aboutSettings.sourceMetadataWasUnavailableWhenThisBuildWasCreated")
                  : t("settings.aboutSettings.capturedWhenThisBuildWasCreated")
              }
            >
              <span>
                {build.dirty === null
                  ? t("aboutSettings.unknown")
                  : build.dirty
                    ? t("aboutSettings.localChangesDirty")
                    : t("aboutSettings.clean")}
              </span>
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2">
          <ExternalLinkButton href="https://eda.kirameki.cafe">
            {t("settings.aboutSettings.website")}
          </ExternalLinkButton>

          <ExternalLinkButton href={repositoryUrl}>
            {t("settings.aboutSettings.sourceCode")}
          </ExternalLinkButton>

          <ExternalLinkButton href={UPDATE_DOWNLOAD_PAGE}>
            {t("settings.updatesSettings.downloadPage")}
          </ExternalLinkButton>
        </div>
      </section>

      <section
        aria-labelledby="about-maintainer-heading"
        className="flex flex-wrap items-stretch gap-6 border-t border-border-subtle pt-6"
      >
        <div className="min-w-0 flex-1 basis-64 space-y-3 rounded-md border border-border-subtle bg-bg-surface p-3">
          <h2 id="about-maintainer-heading" className="flex items-center gap-2 text-sm font-medium">
            <ProviderIcon provider="GitHub" />
            {t("settings.aboutSettings.maintainer")}
          </h2>

          <div className="min-h-36" aria-busy={loadingProfile}>
            {loadingProfile ? (
              <div role="status" aria-label={t("settings.aboutSettings.loadingMaintainerProfile")}>
                <div aria-hidden="true" className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-11 w-11 shrink-0 rounded-full" />

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>

                  <div className="flex h-4.5 items-center">
                    <Skeleton className="h-4 w-4/5" />
                  </div>

                  <div className="flex h-4.5 items-center gap-1.5">
                    <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>

                  <div className="flex h-4.5 items-center gap-1.5">
                    <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-sm" />
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-6 w-6 rounded-sm" />
                  </div>
                </div>
              </div>
            ) : (
              <GitHubProfile
                login={profile?.login ?? maintainer}
                name={profile?.name ?? t("settings.aboutSettings.yuzu")}
                bio={profile?.bio}
                location={profile?.location}
                avatarDataUrl={profile?.avatarDataUrl}
                hue={45}
                email={maintainerEmail}
                onOpenProfile={() =>
                  window.open(`https://github.com/${maintainer}`, "_blank", "noopener,noreferrer")
                }
              >
                <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                  <Mail size={14} aria-hidden="true" className="shrink-0" />

                  <span className="selectable min-w-0 [overflow-wrap:anywhere]">
                    {maintainerEmail}
                  </span>

                  <span className="-my-1 inline-flex shrink-0">
                    <CopyButton
                      value={maintainerEmail}
                      label={t("settings.aboutSettings.copyMaintainerEmail")}
                      size="icon-xs"
                    />
                  </span>
                </div>
              </GitHubProfile>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 basis-64 space-y-3 rounded-md border border-[var(--sponsor-bg)] bg-bg-surface p-4">
          <div>
            <h3 className="text-sm font-medium text-text-primary">
              {t("settings.aboutSettings.supportEda")}
            </h3>

            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              {t("settings.aboutSettings.sponsorYuzuToHelpKeepEdaGrowingAndFreelyAvailable")}
            </p>
          </div>

          <ExternalLinkButton
            href={`https://github.com/sponsors/${maintainer}`}
            variant="primary"
            size="md"
            className="bg-[var(--sponsor-bg)]! text-white!"
            icon={<Heart size={16} aria-hidden="true" className="ui-heartbeat fill-current" />}
          >
            {t("settings.aboutSettings.sponsorOnGitHub")}
            <ExternalLink size={12} aria-hidden="true" />
          </ExternalLinkButton>
        </div>
      </section>

      <UpdatesSettings />

      <section
        aria-labelledby="about-license-heading"
        className="space-y-3 border-t border-border-subtle pt-6"
      >
        <h2 id="about-license-heading" className="text-sm font-medium">
          {t("settings.aboutSettings.license")}
        </h2>

        <p className="text-sm text-text-secondary">
          {t("settings.aboutSettings.edaIsFreeSoftwareLicensedUnderTheGnu")}
        </p>

        <p className="text-xs text-text-tertiary">
          {t("settings.aboutSettings.youCanUseStudyShareAndModifyEda")}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <ExternalLinkButton href={`${repositoryUrl}/blob/main/LICENSE`}>
            {t("settings.aboutSettings.readTheLicense")}
          </ExternalLinkButton>
          <Button
            variant="ghost"
            size="sm"
            disabled
            title={t("settings.aboutSettings.thirdPartyNoticesAreComingSoon")}
          >
            <span>{t("settings.aboutSettings.thirdPartyNotices")}</span>
            <span className="rounded-sm border border-border-subtle px-1.5 py-0.5 text-xs">
              {t("settings.aboutSettings.comingSoon")}
            </span>
          </Button>
        </div>
      </section>
    </div>
  );
}
