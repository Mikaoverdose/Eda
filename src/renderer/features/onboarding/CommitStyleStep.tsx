import { t } from "@shared/i18n";
import { CommitMessage } from "../history/CommitMessage";
import { defaultCommitPrefixes } from "@shared/preferences/commit-prefix";
import { RadioCard, SegmentedControl } from "../../components/ui/index";

export function CommitStyleStep({
  enabled,
  prefixes,
  onEnabled,
  onPrefixes,
}: {
  enabled: boolean;
  prefixes: string;
  onEnabled: (enabled: boolean) => void;
  onPrefixes: (prefixes: string) => void;
}) {
  const style =
    prefixes === defaultCommitPrefixes(true).join("\n")
      ? "emoji"
      : prefixes === defaultCommitPrefixes(false).join("\n")
        ? "plain"
        : "custom";

  return (
    <div className="space-y-5">
      <div
        role="radiogroup"
        aria-label={t("onboarding.commitStyleStep.commitStyle")}
        className="space-y-3"
      >
        {[
          {
            value: false,
            title: t("onboarding.commitStyleStep.freeForm"),
            description: t("onboarding.commitStyleStep.writeCommitMessagesYourWay"),
            example: t("onboarding.commitStyleStep.addProfileSwitcher"),
          },
          {
            value: true,
            title: t("onboarding.commitStyleStep.conventionalCommits"),
            description: t("onboarding.commitStyleStep.aTypePickerToHelpOrganizeYourMessages"),
            example: t("onboarding.commitStyleStep.featAddProfileSwitcher", {
              value1: style === "emoji" ? "✨ " : "",
            }),
          },
        ].map((choice) => (
          <RadioCard
            key={choice.title}
            name="onboarding-commit-style"
            value={String(choice.value)}
            checked={enabled === choice.value}
            onChange={() => onEnabled(choice.value)}
            className="items-start gap-3 px-4 py-3.5"
          >
            <span
              aria-hidden="true"
              className="radio-control mt-0.5"
              data-checked={enabled === choice.value}
            />
            <span className="min-w-0 space-y-1">
              <span className="block text-sm font-medium text-text-primary">{choice.title}</span>
              <span className="block text-xs leading-relaxed text-text-secondary">
                {choice.description}
              </span>
              <CommitMessage className="mt-3">{choice.example}</CommitMessage>
            </span>
          </RadioCard>
        ))}
      </div>
      {enabled && (
        <div className="ui-surface-in space-y-3">
          <p className="text-xs leading-relaxed text-text-secondary">
            {t("onboarding.commitStyleStep.chooseTypesLikeFeatAndFixAsYou")}
          </p>
          <SegmentedControl
            label={t("onboarding.commitStyleStep.commitEmojis")}
            value={style}
            className="w-full"
            options={[
              { value: "plain", label: t("onboarding.commitStyleStep.plain") },
              {
                value: "emoji",
                label: (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span aria-hidden="true">✨</span>
                    {t("onboarding.commitStyleStep.withEmojis")}
                    <span aria-hidden="true">✨</span>
                  </span>
                ),
              },
            ]}
            onChange={(value) => onPrefixes(defaultCommitPrefixes(value === "emoji").join("\n"))}
          />
        </div>
      )}
      <p className="text-xs leading-relaxed text-text-tertiary">
        {t("onboarding.commitStyleStep.appliesToAllProfilesYouCanOverrideThisInProfileSettings")}
      </p>
    </div>
  );
}
