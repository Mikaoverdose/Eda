import { t } from "@shared/i18n";
import { copyText } from "../../utils/clipboard";
import { formatDateTime } from "../../utils/format";
import type { CommitInspection, HistoryCommit } from "@shared/repository/repository-read";
import { useState } from "react";
import { Disclosure, ErrorDialog, TextButton } from "../../components/ui/index";

export function CommitDetails({
  commit,
  inspection,
  onSelectParent,
}: {
  commit: HistoryCommit;
  inspection: CommitInspection | null;
  onSelectParent: (oid: string) => void;
}) {
  const [copyError, setCopyError] = useState<string | null>(null);
  return (
    <div className="app-surface-chrome shrink-0 border-b border-border-subtle bg-bg-surface px-3 py-1.5">
      <p title={commit.subject} className="truncate text-sm font-medium text-text-primary">
        {commit.subject}
      </p>
      <p className="truncate text-xs text-text-tertiary">
        {t("diff.commitDetails.authorDetails", {
          name: commit.author.name,
          email: commit.author.email,
          value3: formatDateTime(commit.committerTimestamp),
        })}
      </p>
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
      <Disclosure
        title={t("diff.commitDetails.commitDetails")}
        className="mt-1 text-xs"
        summaryClassName="text-text-tertiary"
      >
        <p className="selectable mt-2 break-all font-mono">{commit.oid}</p>
        <TextButton
          className="mr-3"
          tone="accent"
          onClick={() =>
            void copyText(commit.oid).catch(() => setCopyError(t("copyButton.clipboardCopyFailed")))
          }
        >
          {t("diff.commitDetails.copySha")}
        </TextButton>
        {commit.parents.map((oid, index) => (
          <TextButton key={oid} className="mr-3" tone="accent" onClick={() => onSelectParent(oid)}>
            {t("diff.commitDetails.parent", { value1: index + 1, oid: oid.slice(0, 8) })}
          </TextButton>
        ))}
        {!commit.parents.length && (
          <span>
            {inspection?.shallow
              ? t("diff.commitDetails.rootOrShallowBoundary")
              : t("diff.commitDetails.rootCommit")}
          </span>
        )}
        {inspection && (
          <p className="mt-2 break-all">
            {t("diff.commitDetails.containingReferences", {
              value1:
                inspection.containingRefs.join(", ") ||
                t("diff.commitDetails.noneDetachedOrUnreachableHistory"),
            })}
          </p>
        )}
        {inspection?.shallow && (
          <p>{t("diff.commitDetails.shallowRepositoryEarlierAncestorsMayNotBeAvailable")}</p>
        )}
      </Disclosure>
      <ErrorDialog onDismiss={() => setCopyError(null)}>{copyError}</ErrorDialog>
    </div>
  );
}
