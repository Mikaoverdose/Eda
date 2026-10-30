import { t } from "@shared/i18n";
import { ExternalLink, Heart } from "lucide-react";
import {
  Button,
  CopyButton,
  DefinitionList,
  ExternalLinkButton,
} from "../../../components/ui/index";
import { ProfileAvatar } from "../../../components/ui/display/ProfileAvatar";
import { UpdatesSettings } from "../../updates/UpdatesSettings";

const maintainer = t("settings.aboutSettings.yuzuZensai");
const emailUser = "yuzu";
const emailBase = "kirameki.cafe";
const maintainerEmail = [emailUser, emailBase].join("@");
const repositoryUrl = `https://github.com/${maintainer}/Eda`;

export function AboutSettings() {
  const build = window.eda.app.version;

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
        <DefinitionList
          items={[
            {
              label: t("settings.aboutSettings.version"),
              value: (
                <div className="flex items-center gap-2">
                  <span className="selectable font-mono">{build.displayVersion}</span>
                  <CopyButton
                    value={build.displayVersion}
                    label={t("settings.aboutSettings.copyEdaVersion")}
                  />
                </div>
              ),
            },
            {
              label: t("settings.aboutSettings.commit"),
              value: build.commit ? (
                <div className="flex min-w-0 items-center gap-2">
                  <span className="selectable min-w-0 font-mono [overflow-wrap:anywhere]">
                    {build.commit}
                  </span>
                  <CopyButton
                    value={build.commit}
                    label={t("settings.aboutSettings.copyBuildCommit")}
                  />
                </div>
              ) : (
                t("aboutSettings.unavailable")
              ),
            },
            {
              label: t("settings.aboutSettings.sourceState"),
              value:
                build.dirty === null
                  ? t("aboutSettings.unknown")
                  : build.dirty
                    ? t("aboutSettings.localChangesDirty")
                    : t("aboutSettings.clean"),
              description:
                build.dirty === null
                  ? t("settings.aboutSettings.sourceMetadataWasUnavailableWhenThisBuildWasCreated")
                  : t("settings.aboutSettings.capturedWhenThisBuildWasCreated"),
            },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <ExternalLinkButton href="https://eda.kirameki.cafe">
            {t("settings.aboutSettings.website")}
          </ExternalLinkButton>
          <ExternalLinkButton href={repositoryUrl}>
            {t("settings.aboutSettings.sourceCode")}
          </ExternalLinkButton>
        </div>
      </section>

      <UpdatesSettings />

      <section
        aria-labelledby="about-maintainer-heading"
        className="space-y-4 border-t border-border-subtle pt-6"
      >
        <h2 id="about-maintainer-heading" className="text-sm font-medium">
          {t("settings.aboutSettings.maintainer")}
        </h2>
        <div className="flex items-center gap-3">
          <ProfileAvatar name="Yuzu" hue={45} email={maintainerEmail} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm font-medium text-text-primary">
                {t("settings.aboutSettings.yuzu")}
              </span>
              <ExternalLinkButton
                href={`https://github.com/${maintainer}`}
                variant="quiet"
                icon={null}
                className="px-0"
              >
                @{maintainer} <ExternalLink size={12} aria-hidden="true" />
              </ExternalLinkButton>
            </div>
            <div className="flex items-center gap-1 text-xs text-text-secondary">
              <span className="selectable [overflow-wrap:anywhere]">{maintainerEmail}</span>
              <CopyButton
                value={maintainerEmail}
                label={t("settings.aboutSettings.copyMaintainerEmail")}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-accent-border bg-bg-surface p-4">
          <div className="min-w-0 flex-1 basis-56">
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
            icon={<Heart size={16} aria-hidden="true" />}
          >
            {t("settings.aboutSettings.sponsorOnGitHub")}
            <ExternalLink size={12} aria-hidden="true" />
          </ExternalLinkButton>
        </div>
      </section>

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
