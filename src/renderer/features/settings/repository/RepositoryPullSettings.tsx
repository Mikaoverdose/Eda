import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { ResolvedSetting } from "@shared/preferences/settings";
import type { PullStrategy } from "@shared/workflows/pull";
import { useEffect, useState } from "react";
import { Button, ErrorDialog, Select } from "../../../components/ui/index";
import { preferenceSource } from "../../../stores/preferences-store";

export function RepositoryPullSettings({ repositoryId }: { repositoryId: string }) {
  const [setting, setSetting] = useState<ResolvedSetting<"pullStrategy"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.eda.pull.preference(repositoryId).then((result) => {
      if (cancelled) return;
      if (result.ok) setSetting(result.value);
      else setError(errorMessage(result.error));
    });
    return () => {
      cancelled = true;
    };
  }, [repositoryId]);

  const save = async (strategy: PullStrategy | null) => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.eda.pull.setPreference(repositoryId, strategy);
      if (!result.ok) setError(errorMessage(result.error));
      else {
        const refreshed = await window.eda.pull.preference(repositoryId);
        if (refreshed.ok) setSetting(refreshed.value);
        else setError(errorMessage(refreshed.error));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block space-y-2 text-sm">
        {t("settings.repositoryPullSettings.defaultPullStrategy")}
        <Select
          aria-label={t("settings.repositoryPullSettings.defaultPullStrategy")}
          className="w-full"
          disabled={busy || !setting}
          value={setting?.value ?? "ff"}
          onValueChange={(value) => void save(value as PullStrategy)}
        >
          <option value="ff">
            {t("settings.repositoryPullSettings.fastForwardIfPossibleOtherwiseMerge")}
          </option>
          <option value="ff-only">{t("settings.repositoryPullSettings.fastForwardOnly")}</option>
          <option value="rebase">{t("settings.repositoryPullSettings.rebaseLocalCommits")}</option>
        </Select>
      </label>
      {setting && <p className="text-xs text-text-tertiary">{preferenceSource(setting)}</p>}
      {setting?.source.kind === "repository" && (
        <Button disabled={busy} onClick={() => void save(null)}>
          {t("settings.repositoryPullSettings.resetToDefault")}
        </Button>
      )}
      {setting?.value === "rebase" && (
        <p className="text-xs text-text-secondary">
          {t("settings.repositoryPullSettings.rebaseChangesLocalCommitIDs")}
        </p>
      )}
      <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
    </div>
  );
}
