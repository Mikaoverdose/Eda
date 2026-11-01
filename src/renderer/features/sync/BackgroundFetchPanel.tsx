import type { Result } from "@shared/errors";
import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { BackgroundFetchState } from "@shared/integrations/background-fetch";
import { useEffect, useRef, useState } from "react";
import { Button, Disclosure, ErrorDialog } from "../../components/ui/index";
import { formatDateTime } from "../../utils/format";

const time = (value: number | null) =>
  value === null ? t("backgroundFetchPanel.never") : formatDateTime(value);

export function BackgroundFetchPanel({ repositoryId }: { repositoryId: string }) {
  const [state, setState] = useState<BackgroundFetchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const generation = useRef(0);
  const load = async () => {
    if (saving.current) return;
    const request = ++generation.current;
    const result = await window.eda.backgroundFetch.inspect(repositoryId);
    if (request !== generation.current) return;
    if (result.ok) setState(result.value);
    else setError(errorMessage(result.error));
  };

  useEffect(() => {
    void load();

    const timer = setInterval(() => {
      void load();
    }, 5000);

    return () => {
      clearInterval(timer);
      generation.current++;
    };
  }, [repositoryId]);

  const run = async (work: () => Promise<Result<void>>) => {
    setBusy(true);
    saving.current = true;
    generation.current++;
    setError(null);

    try {
      const result = await work();
      if (!result.ok) setError(errorMessage(result.error));
      saving.current = false;
      await load();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const paused = state && (!state.online || state.suspended);

  return (
    <Disclosure
      title={t("backgroundFetchPanel.fetchStatus")}
      className="rounded border border-border-default p-3 text-xs"
    >
      <div className="mt-3 space-y-3">
        <p>{t("backgroundFetchPanel.fetchOpenTabsInTheActiveProfileWhile")}</p>
        {state && (
          <>
            <p role="status">
              {!state.online
                ? t("backgroundFetchPanel.oSReportsOfflineAutomaticFetchIsPaused")
                : state.suspended
                  ? t("backgroundFetchPanel.systemSuspendedAutomaticFetchIsPaused")
                  : state.fetching
                    ? t("backgroundFetchPanel.fetchingInBackground")
                    : state.intervalMinutes
                      ? t(
                          "backgroundFetchPanel.automaticFetchEnabledForThisRepositoryInThisProfile",
                        )
                      : t("backgroundFetchPanel.automaticFetchIsOff")}
            </p>
            {state.remotes.map((remote) => (
              <div key={remote.name} className="space-y-1 border-t border-border-subtle pt-2">
                <p className="font-medium">{remote.name}</p>
                <p>
                  {t("backgroundFetchPanel.lastSuccessfulFetch", {
                    value1: time(remote.history?.lastSuccess ?? null),
                  })}
                </p>
                {remote.history?.error && (
                  <p className="text-git-modified">{remote.history.error}</p>
                )}
                <p>
                  {!remote.supported
                    ? t("backgroundFetchPanel.automaticFetchRequiresASingleFetchUrl")
                    : remote.nextFetch === null
                      ? t("backgroundFetchPanel.noAutomaticFetchScheduled")
                      : t(
                          remote.history?.retryAt
                            ? paused
                              ? "backgroundFetchPanel.scheduledRetryPaused"
                              : "backgroundFetchPanel.scheduledRetry"
                            : paused
                              ? "backgroundFetchPanel.scheduledFetchPaused"
                              : "backgroundFetchPanel.scheduledFetch",
                          { time: time(remote.nextFetch) },
                        )}
                </p>
                {remote.history?.failures ? (
                  <Button
                    disabled={busy || !!paused || !remote.supported}
                    onClick={() =>
                      void run(() => window.eda.backgroundFetch.retry(repositoryId, remote.name))
                    }
                  >
                    {t("backgroundFetchPanel.retryNow", { name: remote.name })}
                  </Button>
                ) : null}
              </div>
            ))}
          </>
        )}
        <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      </div>
    </Disclosure>
  );
}
