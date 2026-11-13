import { t } from "@shared/i18n";
import { openSettings } from "../../stores/shell-store";
import { Select } from "../../components/ui/forms/FormControls";
import { Button, Dialog, ErrorDialog } from "../../components/ui/index";
import { TransferProgress } from "./TransportFields";
import { useRemotesDialog } from "./hooks/useRemotesDialog";

export function RemotesDialog({
  repositoryId,
  onClose,
}: {
  repositoryId: string;
  onClose: () => void;
}) {
  const {
    state,
    branch,
    setBranch,
    upstream,
    setUpstream,
    busy,
    error,
    message,
    run,
    selectedBranch,
  } = useRemotesDialog(repositoryId);

  return (
    <Dialog
      title={t("remotesDialog.remotes")}
      description={t("remotesDialog.manageBranchTracking")}
      onClose={onClose}
      footer={
        <Button variant="quiet" onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1 text-xs">
          {t("remotesDialog.localBranch")}

          <Select
            compact
            className="w-full"
            aria-label={t("remotesDialog.localBranch")}
            value={branch}
            disabled={!!busy}
            onValueChange={(value) => {
              setBranch(value);
              setUpstream("");
            }}
          >
            <option value="" disabled>
              {t("remotesDialog.chooseABranch")}
            </option>

            {state.branches
              .filter((item) => !item.remote)
              .map((item) => (
                <option key={item.name}>{item.name}</option>
              ))}
          </Select>
        </label>

        <p className="text-sm">
          {selectedBranch?.upstream
            ? `${selectedBranch.upstream} ${selectedBranch.upstreamState || t("remotesDialog.upToDate")}`
            : t("remotesDialog.noUpstreamConfigured")}
        </p>

        <label className="block space-y-1 text-xs">
          {t("remotesDialog.upstream")}

          <Select
            compact
            className="w-full"
            aria-label={t("remotesDialog.upstream")}
            value={upstream}
            disabled={!!busy}
            onValueChange={(value) => setUpstream(value)}
          >
            <option value="">{t("remotesDialog.noUpstream")}</option>

            {state.branches
              .filter((item) => item.remote)
              .map((item) => (
                <option key={item.name} value={`refs/remotes/${item.name}`}>
                  {item.name}
                </option>
              ))}
          </Select>
        </label>

        <Button
          disabled={!!busy || !branch || (!upstream && !selectedBranch?.upstream)}
          onClick={() =>
            void run("main.remoteService.setUpstream", () =>
              window.eda.remotes.track(repositoryId, branch, upstream || null),
            )
          }
        >
          {upstream ? t("remotesDialog.setUpstream") : t("remotesDialog.unsetUpstream")}
        </Button>

        <p className="text-xs text-text-tertiary">
          {t("remotesDialog.aheadBehindCountsUseLocallyFetchedRefsFetch")}
        </p>

        <Button
          variant="quiet"
          disabled={!!busy}
          onClick={() => {
            onClose();
            openSettings("repository-remotes");
          }}
        >
          {t("remotesDialog.manageRemotesInSettings")}
        </Button>

        {busy && <TransferProgress repositoryId={repositoryId} kindKey={busy} />}

        {message && (
          <p role="status" className="whitespace-pre-wrap break-all text-xs text-git-added">
            {message}
          </p>
        )}

        <ErrorDialog>{error}</ErrorDialog>
      </div>
    </Dialog>
  );
}
