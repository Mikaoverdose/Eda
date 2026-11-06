import { t } from "@shared/i18n";
import { formatDateTime } from "../../utils/format";
import type { CommitInspection, HistoryCommit } from "@shared/repository/repository-read";
import { ChevronRight, KeyRound, ShieldOff } from "lucide-react";
import { useId, useState } from "react";
import { ProfileAvatar } from "../../components/ui/display/ProfileAvatar";
import { CopyButton, Disclosure, TextButton } from "../../components/ui/index";

export function CommitDetails({
  commit,
  inspection,
  onSelectParent,
}: {
  commit: HistoryCommit;
  inspection: CommitInspection | null;
  onSelectParent: (oid: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  return (
    <div className="app-surface-chrome shrink-0 border-b border-border-subtle bg-bg-surface px-3 py-2">
      <p
        title={commit.subject}
        className="line-clamp-2 break-words text-sm font-medium leading-snug text-text-primary"
      >
        {commit.subject}
      </p>
      <div className="my-1.5 flex min-w-0 items-center gap-2">
        <ProfileAvatar name={commit.author.name} email={commit.author.email} hue={210} small />
        <div className="min-w-0 flex-1 text-xs">
          <p
            title={`${commit.author.name} <${commit.author.email}>`}
            className="truncate font-medium text-text-secondary"
          >
            {commit.author.name}
          </p>
          <time
            dateTime={commit.committerTimestamp}
            title={formatDateTime(commit.committerTimestamp)}
            className="block truncate text-text-tertiary"
          >
            {formatDateTime(commit.committerTimestamp)}
          </time>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-1 text-xs">
        <span title={commit.oid} className="mono text-text-tertiary">
          {commit.oid.slice(0, 8)}
        </span>
        <CopyButton value={commit.oid} label={t("diff.commitDetails.copySha")} size="icon-xs" />
        {typeof inspection?.signed === "boolean" && (
          <span
            role="img"
            tabIndex={0}
            aria-label={
              inspection.signed ? t("diff.commitDetails.signed") : t("diff.commitDetails.unsigned")
            }
            title={
              inspection.signed
                ? t("diff.commitDetails.signaturePresent")
                : t("diff.commitDetails.signatureAbsent")
            }
            className={`flex shrink-0 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text ${inspection.signed ? "text-accent-text" : "text-text-tertiary"}`}
          >
            {inspection.signed ? (
              <KeyRound size={14} aria-hidden="true" />
            ) : (
              <ShieldOff size={14} aria-hidden="true" />
            )}
          </span>
        )}
        <TextButton
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((value) => !value)}
          className="ml-auto flex min-w-0 items-center gap-1"
        >
          <ChevronRight
            size={14}
            aria-hidden="true"
            className={`shrink-0 ${expanded ? "rotate-90" : ""}`}
          />
          <span className="truncate">{t("diff.commitDetails.commitDetails")}</span>
        </TextButton>
      </div>
      {commit.body && (
        <Disclosure
          title={t("diff.commitDetails.fullCommitMessage")}
          className="mt-1 text-xs"
          summaryClassName="text-text-tertiary"
        >
          <p className="selectable mt-2 max-h-24 overflow-auto whitespace-pre-wrap">
            {commit.body}
          </p>
        </Disclosure>
      )}
      <div id={detailsId} hidden={!expanded}>
        <dl className="mt-2 space-y-2 border-t border-border-subtle pt-2 text-xs">
          <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-x-3">
            <dt className="text-text-tertiary">{t("diff.commitDetails.sha")}</dt>
            <dd className="selectable break-all font-mono text-text-secondary">{commit.oid}</dd>
          </div>
          <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-x-3">
            <dt className="text-text-tertiary">{t("diff.commitDetails.author")}</dt>
            <dd className="selectable break-all text-text-secondary">{commit.author.email}</dd>
          </div>
          <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-x-3">
            <dt className="text-text-tertiary">{t("diff.commitDetails.parents")}</dt>
            <dd className="flex min-w-0 flex-wrap gap-1.5">
              {commit.parents.map((oid, index) => (
                <TextButton
                  key={oid}
                  className="mono border border-border-default bg-bg-raised px-1.5"
                  tone="accent"
                  title={oid}
                  aria-label={t("diff.commitDetails.parent", {
                    value1: index + 1,
                    oid: oid.slice(0, 8),
                  })}
                  onClick={() => onSelectParent(oid)}
                >
                  {oid.slice(0, 8)}
                </TextButton>
              ))}
              {!commit.parents.length && (
                <span>
                  {inspection?.shallow
                    ? t("diff.commitDetails.rootOrShallowBoundary")
                    : t("diff.commitDetails.rootCommit")}
                </span>
              )}
            </dd>
          </div>
          {inspection && (
            <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-x-3">
              <dt className="text-text-tertiary">{t("diff.commitDetails.references")}</dt>
              <dd className="flex min-w-0 flex-wrap gap-1.5">
                {inspection.containingRefs.length
                  ? inspection.containingRefs.map((ref) => (
                      <span
                        key={ref}
                        title={ref}
                        className="selectable max-w-full break-all rounded-sm border border-border-default bg-bg-raised px-1.5 py-0.5 text-text-secondary"
                      >
                        {ref.replace(/^refs\/(?:heads|remotes|tags)\//, "")}
                      </span>
                    ))
                  : t("diff.commitDetails.noneDetachedOrUnreachableHistory")}
              </dd>
            </div>
          )}
        </dl>
        {inspection?.shallow && (
          <p>{t("diff.commitDetails.shallowRepositoryEarlierAncestorsMayNotBeAvailable")}</p>
        )}
      </div>
    </div>
  );
}
