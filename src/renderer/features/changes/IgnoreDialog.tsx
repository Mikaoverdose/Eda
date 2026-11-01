import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { IgnoreInspection, IgnoreKind } from "@shared/repository/ignore";
import { useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  CodeBlock,
  Dialog,
  ErrorDialog,
  Select,
} from "../../components/ui/index";
import { useRepositoryStore } from "../../stores/repository-store";

export function IgnoreDialog({
  repositoryId,
  path,
  onClose,
}: {
  repositoryId: string;
  path: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<IgnoreKind>("path");
  const [inspection, setInspection] = useState<IgnoreInspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    let alive = true;

    setInspection(null);
    setError(null);
    void window.eda.repository.inspectIgnore(repositoryId, path, kind).then((result) => {
      if (!alive) return;
      if (result.ok) setInspection(result.value);
      else setError(errorMessage(result.error));
    });

    return () => {
      alive = false;
    };
  }, [repositoryId, path, kind]);

  const run = async (stop: boolean) => {
    setBusy(true);
    setError(null);

    try {
      const result = stop
        ? await window.eda.repository.stopTracking(repositoryId, path)
        : await window.eda.repository.addIgnore(repositoryId, path, kind);

      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }

      if (useRepositoryStore.getState().repositoryId === repositoryId)
        await useRepositoryStore.getState().refresh();

      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t("ignoreDialog.ignoreRules")}
      description={path}
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !inspection} onClick={() => void run(false)}>
            {t("ignoreDialog.addIgnoreRule")}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <label className="flex items-center justify-between">
          {t("ignoreDialog.match")}
          <Select
            aria-label={t("ignoreDialog.ignoreRuleType")}
            value={kind}
            disabled={busy}
            compact
            onValueChange={(value) => setKind(value as IgnoreKind)}
          >
            <option value="path">{t("ignoreDialog.thisPath")}</option>
            <option value="extension">{t("ignoreDialog.fileExtension")}</option>
            <option value="directory">{t("ignoreDialog.parentDirectory")}</option>
          </Select>
        </label>
        {inspection && (
          <>
            <p className="text-text-tertiary">{t("ignoreDialog.appendToTheRootGitignore")}</p>
            <CodeBlock label={t("ignoreDialog.ruleToAddToGitignore")}>{inspection.rule}</CodeBlock>
            <p>
              {inspection.source
                ? t("ignoreDialog.by", {
                    value1: inspection.ignored
                      ? t("ignoreDialog.excluded")
                      : t("ignoreDialog.includedAgain"),
                    source: inspection.source,
                    line: inspection.line,
                    pattern: inspection.pattern,
                  })
                : t("ignoreDialog.noMatchingIgnoreRule")}
            </p>
            {inspection.tracked && (
              <div className="space-y-2 border-t border-border-subtle pt-3">
                <p>
                  {t("ignoreDialog.thisFileIsTrackedIgnoreRulesDoNotRemoveTrackedFilesFromGit")}
                </p>
                <Checkbox
                  className="flex items-start gap-2"
                  checked={confirmStop}
                  onChange={(event) => setConfirmStop(event.target.checked)}
                >
                  {t(
                    "ignoreDialog.stageRemovalFromGitWhileKeepingTheFileOnDiskThisIsASeparateAction",
                  )}
                </Checkbox>
                <Button disabled={!confirmStop || busy} onClick={() => void run(true)}>
                  {t("ignoreDialog.stopTrackingFile")}
                </Button>
              </div>
            )}
          </>
        )}
        <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      </div>
    </Dialog>
  );
}
