import { t } from "@shared/i18n";
import { useState } from "react";
import type { TransportCredentials } from "@shared/integrations/remotes";
import { useAppStore } from "../../stores/app-store";
import { Button, Dialog, Input, ErrorDialog } from "../../components/ui/index";
import { TransferProgress, TransportFields } from "../sync/TransportFields";

export function CloneRepositoryDialog({ onClose }: { onClose: () => void }) {
  const [profileId] = useState(() => useAppStore.getState().activeIdentity!.id);
  const [url, setUrl] = useState("");
  const [parent, setParent] = useState("");
  const [name, setName] = useState("");
  const [auth, setAuth] = useState<TransportCredentials>({ username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clone = async () => {
    setBusy(true);
    setError(null);

    try {
      const result = await window.eda.remotes.clone({
        profileId,
        url,
        parent,
        name,
        ...(auth.username || auth.password ? { credentials: auth } : {}),
      });

      setAuth({ username: "", password: "" });

      if (!result.ok) {
        setError(
          t("cloneRepositoryDialog.anyIncompleteDestinationIsPreservedInspectItBefore", {
            message: result.error.message,
            value2: result.error.suggestedAction ?? "",
          }),
        );
        return;
      }

      if (useAppStore.getState().activeIdentity?.id !== profileId) return;

      await useAppStore.getState().refreshRepositories();
      useAppStore.getState().selectRepository(result.value.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t("cloneRepositoryDialog.cloneRepository")}
      description={t(
        "cloneRepositoryDialog.cloneAnHttpssshOrLocalRepositoryIntoANewFolderForThisProfile",
      )}
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button disabled={busy || !url || !parent || !name} onClick={() => void clone()}>
            {busy ? t("cloneRepositoryDialog.cloning") : t("cloneRepositoryDialog.cloneRepository")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1 text-sm">
          {t("cloneRepositoryDialog.repositoryUrl")}
          <Input
            aria-label={t("cloneRepositoryDialog.repositoryUrl")}
            value={url}
            disabled={busy}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t("cloneRepositoryDialog.httpsHostOwnerRepositoryGit")}
          />
        </label>
        <label className="block space-y-1 text-sm">
          {t("cloneRepositoryDialog.parentFolder")}
          <Input
            aria-label={t("cloneRepositoryDialog.cloneParentFolder")}
            value={parent}
            disabled={busy}
            onChange={(event) => setParent(event.target.value)}
          />
        </label>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void window.eda.repository.chooseFolder().then((result) => {
              if (result.ok && result.value) setParent(result.value);
              else if (!result.ok) setError(result.error.message);
            })
          }
        >
          {t("cloneRepositoryDialog.browseFolders")}
        </Button>
        <label className="block space-y-1 text-sm">
          {t("cloneRepositoryDialog.newFolderName")}
          <Input
            aria-label={t("cloneRepositoryDialog.cloneFolderName")}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <TransportFields value={auth} onChange={setAuth} disabled={busy} />
        {busy && <TransferProgress kindKey="operationTitles.cloneRepository" />}
        <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      </div>
    </Dialog>
  );
}
