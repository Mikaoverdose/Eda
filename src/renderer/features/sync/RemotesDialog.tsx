import { t } from "@shared/i18n";
import { openSettings } from "../../commands/open-settings";
import { RemoteSelect } from "./RemoteSelect";
import { RejectedPushNotice } from "./RejectedPushNotice";
import { PushReview } from "./PushReview";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { PUSH_MODES, REMOTE_REF_KINDS } from "@shared/integrations/remotes";
import { isOneOf } from "@shared/validation";
import { Button, Dialog, Input, Checkbox, ErrorDialog } from "../../components/ui/index";
import { TransferProgress, TransportFields } from "./TransportFields";
import type { RemoteTab } from "./hooks/useRemotesDialog";
import { useRemotesDialog } from "./hooks/useRemotesDialog";

export function RemotesDialog({
  repositoryId,
  onClose,
  afterCommit = false,
  initialTab,
  initialTag,
  initialRemote,
  onChanged,
}: {
  repositoryId: string;
  onClose: () => void;
  afterCommit?: boolean;
  initialTab?: RemoteTab;
  initialTag?: string;
  initialRemote?: string;
  onChanged?: (() => void) | undefined;
}) {
  const {
    state,
    tab,
    setTab,
    remote,
    setRemote,
    branch,
    setBranch,
    destination,
    setDestination,
    upstream,
    setUpstream,
    publish,
    setPublish,
    mode,
    setMode,
    refKind,
    setRefKind,
    tagNames,
    confirmation,
    setConfirmation,
    preview,
    setPreview,
    auth,
    setAuth,
    busy,
    error,
    setError,
    rejectedPush,
    setRejectedPush,
    message,
    setMessage,
    run,
    credentials,
    selectedRemote,
    selectedBranch,
  } = useRemotesDialog(repositoryId, initialTab, initialTag, initialRemote);

  return (
    <Dialog
      title={t("remotesDialog.remotes")}
      description={t("remotesDialog.manageDestinationsTrackingAndTransfers")}
      onClose={onClose}
      footer={
        <Button variant="quiet" onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      <TabsPrimitive.Root
        value={tab}
        onValueChange={(value) => {
          setTab(value as typeof tab);
          setAuth({ username: "", password: "" });
          setPreview(null);
          setError(null);
          setRejectedPush(null);
          setMessage(null);
        }}
        className="space-y-4"
      >
        {afterCommit && (
          <p role="status" className="text-sm text-git-added">
            {t("remotesDialog.localCommitSavedReviewItsPushDestinationBelow")}
          </p>
        )}
        <TabsPrimitive.List
          className="flex gap-1 border-b border-border-subtle pb-2"
          aria-label={t("remotesDialog.remoteActions")}
        >
          {(["push", "tracking"] as const).map((value) => (
            <TabsPrimitive.Trigger key={value} value={value} disabled={!!busy} asChild>
              <Button size="sm" variant={tab === value ? "primary" : "quiet"}>
                {t(value === "push" ? "remotesDialog.pushTab" : "remotesDialog.trackingTab")}
              </Button>
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
        <TabsPrimitive.Content value={tab} className="space-y-4 outline-none">
          {tab === "push" && (
            <label className="block space-y-1 text-xs">
              {t("remotesDialog.remote")}
              <RemoteSelect
                aria-label={t("remotesDialog.remote")}
                value={remote}
                disabled={!!busy || !!preview}
                onValueChange={(value) => {
                  setRemote(value);
                  setAuth({ username: "", password: "" });
                }}
              >
                <option value="" disabled>
                  {t("remotesDialog.chooseARemote")}
                </option>
                {state.remotes.map((item) => (
                  <option key={item.name}>{item.name}</option>
                ))}
              </RemoteSelect>
              <span className="block break-all text-text-tertiary">
                {(tab === "push" ? selectedRemote?.pushUrls : selectedRemote?.fetchUrls)?.join(
                  ", ",
                )}
              </span>
            </label>
          )}
          {tab === "push" && (
            <label className="block space-y-1 text-xs">
              {t("remotesDialog.refType")}
              <RemoteSelect
                aria-label={t("remotesDialog.refType")}
                value={refKind}
                disabled={!!busy || !!preview}
                onValueChange={(value) => {
                  if (isOneOf(value, REMOTE_REF_KINDS)) setRefKind(value);
                  setBranch("");
                  setDestination("");
                }}
              >
                <option value="branch">{t("remotesDialog.branch")}</option>
                <option value="tag">{t("remotesDialog.tag")}</option>
              </RemoteSelect>
            </label>
          )}
          {(tab === "tracking" || (tab === "push" && mode !== "delete")) && (
            <label className="block space-y-1 text-xs">
              {tab === "push" && refKind === "tag"
                ? t("remotesDialog.localTag")
                : t("remotesDialog.localBranch")}
              <RemoteSelect
                aria-label={
                  tab === "push" && refKind === "tag"
                    ? t("remotesDialog.localTag")
                    : t("remotesDialog.localBranch")
                }
                value={branch}
                disabled={!!busy || !!preview}
                onValueChange={(value) => {
                  setBranch(value);
                  setDestination(value);
                  setUpstream("");
                }}
              >
                <option value="" disabled>
                  {t(
                    tab === "push" && refKind === "tag"
                      ? "remotesDialog.chooseATag"
                      : "remotesDialog.chooseABranch",
                  )}
                </option>
                {(tab === "push" && refKind === "tag"
                  ? tagNames
                  : state.branches.filter((item) => !item.remote).map((item) => item.name)
                ).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </RemoteSelect>
            </label>
          )}
          {tab === "tracking" && (
            <>
              <p className="text-sm">
                {selectedBranch?.upstream
                  ? `${selectedBranch.upstream} ${selectedBranch.upstreamState || t("remotesDialog.upToDate")}`
                  : t("remotesDialog.noUpstreamConfigured")}
              </p>
              <label className="block space-y-1 text-xs">
                {t("remotesDialog.upstream")}
                <RemoteSelect
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
                </RemoteSelect>
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
            </>
          )}
          {tab === "push" && (
            <>
              <label className="block space-y-1 text-xs">
                {refKind === "tag"
                  ? t("remotesDialog.destinationTag")
                  : t("remotesDialog.destinationBranch")}
                <Input
                  aria-label={
                    refKind === "tag"
                      ? t("remotesDialog.destinationTag")
                      : t("remotesDialog.destinationBranch")
                  }
                  value={destination}
                  disabled={!!busy || !!preview}
                  onChange={(event) => setDestination(event.target.value)}
                />
              </label>
              {refKind === "branch" && mode !== "delete" && (
                <Checkbox
                  className="flex gap-2 text-sm"
                  checked={publish}
                  disabled={!!busy || !!preview}
                  onChange={(event) => setPublish(event.target.checked)}
                >
                  {t("remotesDialog.setUpstreamAfterSuccessfulPush")}
                </Checkbox>
              )}
              <label className="block space-y-1 text-xs">
                {t("remotesDialog.pushMode")}
                <RemoteSelect
                  aria-label={t("remotesDialog.pushMode")}
                  value={mode}
                  disabled={!!busy || !!preview}
                  onValueChange={(value) => {
                    if (isOneOf(value, PUSH_MODES)) setMode(value);
                    setConfirmation("");
                  }}
                >
                  <option value="normal">{t("remotesDialog.normalPush")}</option>
                  <option value="lease">{t("remotesDialog.forceWithLease")}</option>
                  <option value="delete">{t("remotesDialog.deleteRemoteRef")}</option>
                  <option value="force">{t("remotesDialog.unrestrictedForceAdvanced")}</option>
                </RemoteSelect>
              </label>
              <TransportFields value={auth} onChange={setAuth} disabled={!!busy || !!preview} />
              {preview ? (
                <PushReview
                  preview={preview}
                  mode={mode}
                  confirmation={confirmation}
                  busy={!!busy}
                  onConfirmationChange={setConfirmation}
                  onConfirm={() => {
                    const token = preview.token;
                    setPreview(null);
                    void run(
                      "operationTitles.pushBranch",
                      () => window.eda.remotes.push(repositoryId, token, credentials.credentials),
                      (value) => {
                        setMessage(value);
                        onChanged?.();
                      },
                    ).finally(() => setAuth({ username: "", password: "" }));
                  }}
                  onBack={() => setPreview(null)}
                />
              ) : (
                <Button
                  disabled={!!busy || !remote || (mode !== "delete" && !branch) || !destination}
                  onClick={() =>
                    void run(
                      "main.remoteService.inspectPushDestination",
                      () =>
                        window.eda.remotes.preparePush({
                          repositoryId,
                          remote,
                          branch: branch || destination,
                          destination,
                          setUpstream: publish && refKind === "branch" && mode !== "delete",
                          mode,
                          refKind,
                          ...credentials,
                        }),
                      (value) => {
                        setConfirmation("");
                        setPreview(value);
                      },
                    )
                  }
                >
                  {t("remotesDialog.reviewPush")}
                </Button>
              )}
            </>
          )}
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
          {rejectedPush && (
            <RejectedPushNotice
              rejected={rejectedPush}
              branches={state.branches}
              busy={!!busy}
              onReviewTracking={() => {
                setTab("tracking");
                setPreview(null);
                setError(null);
                setRejectedPush(null);
              }}
            />
          )}
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>
    </Dialog>
  );
}
