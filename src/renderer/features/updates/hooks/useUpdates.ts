import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { UpdateState } from "@shared/updates";
import { useEffect, useState } from "react";
import { useSimulationStore } from "../../../stores/simulation-store";

export function useUpdates() {
  const preview = useSimulationStore((store) => store.update);
  const [state, setState] = useState<UpdateState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const accept = (next: UpdateState) => {
      if (alive)
        setState((current) => (!current || next.revision >= current.revision ? next : current));
    };
    const unsubscribe = window.eda.events.onUpdateChanged(accept);

    void window.eda.updates
      .state()
      .then((result) => {
        if (result.ok) accept(result.value);
        else if (alive) setError(errorMessage(result.error));
      })
      .catch(() => {
        if (alive) setError(t("settings.useUpdates.couldNotReadUpdateStatus"));
      });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return { state: preview ?? state, error: preview ? null : error, preview: preview !== null };
}
