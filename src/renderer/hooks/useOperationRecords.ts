import { errorMessage } from "@shared/errors";
import type { OperationRecord } from "@shared/operations";
import { useSyncExternalStore } from "react";

interface OperationSnapshot {
  records: OperationRecord[];
  error: string | null;
}

const emptySnapshot: OperationSnapshot = { records: [], error: null };
const listeners = new Set<() => void>();
let snapshot = emptySnapshot;
let revision = 0;
let unsubscribe: (() => void) | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

async function refresh() {
  const request = ++revision;

  try {
    const result = await window.eda.operations.list();
    if (request !== revision) return;

    snapshot = result.ok
      ? { records: result.value, error: null }
      : { ...snapshot, error: errorMessage(result.error) };
  } catch (error) {
    if (request !== revision) return;
    snapshot = { ...snapshot, error: errorMessage(error) };
  }

  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (listeners.size === 1) {
    unsubscribe = window.eda.events.onOperationsChanged(() => {
      if (timer) return;

      timer = setTimeout(() => {
        timer = undefined;
        void refresh();
      }, 100);
    });

    void refresh();
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size) return;

    revision++;
    clearTimeout(timer);
    timer = undefined;
    unsubscribe?.();
    unsubscribe = undefined;
    snapshot = emptySnapshot;
  };
}

export function useOperationRecords() {
  return useSyncExternalStore(subscribe, () => snapshot);
}
