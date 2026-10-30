import { t } from "@shared/i18n";
import { useEffect, useState } from "react";
import type { UpdateState } from "@shared/updates";

export function useUpdates() {
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
        else if (alive) setError(result.error.message);
      })
      .catch(() => {
        if (alive) setError(t("settings.useUpdates.couldNotReadUpdateStatus"));
      });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return { state, error };
}
