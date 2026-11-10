import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { InitRepositoryOptions } from "@shared/repository/repository";
import { useState } from "react";
import {
  DialogActions,
  Button,
  Checkbox,
  Dialog,
  ErrorDialog,
  Input,
  Select,
} from "../../components/ui/index";
import { useAppStore } from "../../stores/app-store";

export function InitRepositoryDialog({ onClose }: { onClose: () => void }) {
  const [path, setPath] = useState("");

  const [options, setOptions] = useState<InitRepositoryOptions>({
    branch: "main",
    readme: true,
    ignore: "none",
    license: "none",
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const profileId = useAppStore.getState().activeIdentity?.id;

    setBusy(true);
    setError(null);

    try {
      const result = await window.eda.repository.init(path, options);

      if (!result.ok) {
        setError(errorMessage(result.error));
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
      title={t("initRepositoryDialog.createARepository")}
      description={t("initRepositoryDialog.initializeGitInAnExistingFolderSelectedStarter")}
      onClose={onClose}
      busy={busy}
      footer={
        <DialogActions
          busy={busy}
          onClose={onClose}
          onConfirm={() => void create()}
          confirmLabel={t("initRepositoryDialog.createRepository")}
          confirmDisabled={!path || !options.branch.trim()}
          confirmVariant="secondary"
        />
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 break-all text-xs text-text-secondary">
            {path || t("initRepositoryDialog.chooseAFolder")}
          </span>

          <Button
            disabled={busy}
            onClick={() =>
              void window.eda.repository.chooseFolder().then((result) => {
                if (result.ok && result.value) setPath(result.value);
                else if (!result.ok) setError(errorMessage(result.error));
              })
            }
          >
            {t("common.browse")}
          </Button>
        </div>

        <label className="block space-y-2 text-sm">
          <span>{t("initRepositoryDialog.initialBranch")}</span>

          <Input
            aria-label={t("initRepositoryDialog.initialBranch")}
            value={options.branch}
            onChange={(event) => setOptions({ ...options, branch: event.target.value })}
          />
        </label>

        <Checkbox
          className="flex items-center gap-2 text-sm"
          checked={options.readme}
          onChange={(event) => setOptions({ ...options, readme: event.target.checked })}
        >
          {t("initRepositoryDialog.addReadmeMd")}
        </Checkbox>

        <label className="flex items-center justify-between text-sm">
          {t("initRepositoryDialog.ignoreTemplate")}

          <Select
            aria-label={t("initRepositoryDialog.ignoreTemplate")}
            compact
            value={options.ignore}
            onValueChange={(value) =>
              setOptions({
                ...options,
                ignore: value as InitRepositoryOptions["ignore"],
              })
            }
          >
            <option value="none">{t("common.none")}</option>
            <option value="node">{t("initRepositoryDialog.nodeJs")}</option>
            <option value="python">{t("initRepositoryDialog.python")}</option>
          </Select>
        </label>

        <label className="flex items-center justify-between text-sm">
          {t("initRepositoryDialog.licenseFile")}

          <Select
            aria-label={t("initRepositoryDialog.licenseFile")}
            compact
            value={options.license}
            onValueChange={(value) =>
              setOptions({
                ...options,
                license: value as InitRepositoryOptions["license"],
              })
            }
          >
            <option value="none">{t("common.none")}</option>
            <option value="MIT">{t("initRepositoryDialog.mit")}</option>
          </Select>
        </label>

        <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      </div>
    </Dialog>
  );
}
