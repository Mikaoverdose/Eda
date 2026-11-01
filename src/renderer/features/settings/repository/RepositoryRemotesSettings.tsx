import { t } from "@shared/i18n";
import { useRemotesDialog } from "../../sync/hooks/useRemotesDialog";
import { RemoteConfiguration } from "../../sync/RemoteConfiguration";
import { Button, Dialog, ErrorDialog } from "../../../components/ui/index";

export function RepositoryRemotesSettings({ repositoryId }: { repositoryId: string }) {
  const { state, edit, setEdit, remove, setRemove, run, busy, error, setError, message } =
    useRemotesDialog(repositoryId, "configure");
  return (
    <div className="max-w-xl space-y-4">
      <RemoteConfiguration
        remotes={state.remotes}
        edit={edit}
        busy={!!busy}
        onEdit={setEdit}
        onRemove={setRemove}
        onSave={() =>
          void run("main.remoteService.configureRemote", () =>
            window.eda.remotes.change(repositoryId, edit),
          )
        }
      />
      {message && (
        <p role="status" className="text-xs text-git-added">
          {message}
        </p>
      )}
      <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      {remove && (
        <Dialog
          title={t("settings.repositoryRemotesSettings.remove", { remove: remove })}
          description={t(
            "settings.repositoryRemotesSettings.removeThisRemoteSConfigurationAndLocalTracking",
          )}
          onClose={() => setRemove(null)}
          footer={
            <Button
              disabled={!!busy}
              onClick={() => {
                const name = remove;
                setRemove(null);
                void run("main.remoteService.configureRemote", () =>
                  window.eda.remotes.change(repositoryId, { kind: "remove", name }),
                );
              }}
            >
              {t("settings.repositoryRemotesSettings.removeRemote")}
            </Button>
          }
        >
          <p className="text-sm">
            {t(
              "settings.repositoryRemotesSettings.branchesUsingThisRemoteMayLoseTheirUpstreamConfiguration",
            )}
          </p>
        </Dialog>
      )}
    </div>
  );
}
