import { t } from "@shared/i18n";
import type { PushPreview, PushRequest } from "@shared/integrations/remotes";
import { ArrowRightIcon as ArrowRight } from "../../components/ui/icons";
import { Button, Input } from "../../components/ui/index";

export function PushReview({
  preview,
  mode,
  confirmation,
  busy,
  onConfirmationChange,
  onConfirm,
  onBack,
}: {
  preview: PushPreview;
  mode: PushRequest["mode"];
  confirmation: string;
  busy: boolean;
  onConfirmationChange: (value: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-3 rounded border border-border-default bg-bg-inset p-3 text-xs">
      <p className="break-all">
        {preview.source || t("common.delete")}{" "}
        <ArrowRight size={14} className="inline align-[-2px]" aria-hidden="true" /> {preview.url} ,{" "}
        {preview.destination}
      </p>
      <p>
        {t("remotes.pushReview.localRemote", {
          value1: preview.localOid?.slice(0, 12) ?? t("pushReview.noLocalChanges"),
          value2: preview.remoteOid?.slice(0, 12) ?? t("pushReview.newRef"),
        })}
      </p>
      {mode === "lease" && (
        <p className="text-git-modified">
          {t("remotes.pushReview.thisCanReplaceRemoteHistoryTheUpdateWill")}
        </p>
      )}
      {(mode === "force" || mode === "delete") && (
        <div className="space-y-2">
          <p className="text-git-deleted">
            {mode === "delete"
              ? t("remotes.pushReview.deleteOnlyThisRemoteRefLocalBranchesTags")
              : t("remotes.pushReview.unrestrictedForceCanOverwriteCommitsPushedAfterThis")}
          </p>
          <label className="block">
            {t("remotes.pushReview.typeToConfirm", { destination: preview.destination })}
            <Input
              aria-label={t("remotes.pushReview.confirmRemoteRef")}
              value={confirmation}
              onChange={(event) => onConfirmationChange(event.target.value)}
            />
          </label>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          disabled={
            busy ||
            ((mode === "force" || mode === "delete") && confirmation !== preview.destination)
          }
          onClick={onConfirm}
        >
          {mode === "delete"
            ? t("remotes.pushReview.confirmDeletion")
            : t("remotes.pushReview.confirmPush")}
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onBack}>
          {t("common.back")}
        </Button>
      </div>
    </div>
  );
}
