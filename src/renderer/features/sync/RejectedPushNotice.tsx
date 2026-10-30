import { t } from "@shared/i18n";
import type { RemoteState } from "@shared/integrations/remotes";
import { Button } from "../../components/ui/index";

export interface RejectedPush {
  branch: string;
  remote: string;
  destination: string;
  refKind: "branch" | "tag";
}

export function RejectedPushNotice({
  rejected,
  branches,
  busy,
  onReviewTracking,
}: {
  rejected: RejectedPush;
  branches: RemoteState["branches"];
  busy: boolean;
  onReviewTracking: () => void;
}) {
  return (
    <div className="space-y-2 rounded border border-border-default p-3 text-xs">
      <p>
        {t("remotes.rejectedPushNotice.rejectedDestinationYourLocalCommitsRemainIntact", {
          remote: rejected.remote,
          destination: rejected.destination,
        })}
      </p>
      {rejected.refKind === "tag" ? (
        <p>
          {t(
            "remotes.rejectedPushNotice.aTagUpdateNeedsAnExplicitTagDecisionPullDoesNotReconcileTags",
          )}
        </p>
      ) : branches.some(
          (item) =>
            item.isHead &&
            item.name === rejected.branch &&
            item.upstream === `${rejected.remote}/${rejected.destination}`,
        ) ? (
        <p>
          {t(
            "remotes.rejectedPushNotice.usePullInTheToolbarToIntegrateUpstreamChangesThenRetryThePush",
          )}
        </p>
      ) : (
        <>
          <p>{t("remotes.rejectedPushNotice.pullAppliesOnlyToTheCurrentBranchS")}</p>
          <Button disabled={busy} onClick={onReviewTracking}>
            {t("remotes.rejectedPushNotice.reviewBranchTracking")}
          </Button>
        </>
      )}
    </div>
  );
}
