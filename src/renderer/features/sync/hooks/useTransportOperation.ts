import { useEffect, useRef, useState } from "react";
import { ACTION_FEEDBACK } from "../../../motion";
import { useAppStore } from "../../../stores/app-store";

export function useTransportOperation(repositoryId: string) {
  const running = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function begin() {
    const profileId = useAppStore.getState().activeIdentity?.id;
    const current = () => {
      const state = useAppStore.getState();
      return (
        mounted.current &&
        state.selectedRepositoryId === repositoryId &&
        state.activeIdentity?.id === profileId
      );
    };
    if (running.current || !profileId || !current()) return;

    running.current = true;
    setBusy(true);
    const minimumPending = new Promise<void>((resolve) =>
      setTimeout(resolve, ACTION_FEEDBACK.minimumPending),
    );

    async function finish() {
      await minimumPending;
      running.current = false;
      if (mounted.current) setBusy(false);
    }

    return { profileId, current, finish };
  }

  return { busy, begin };
}
