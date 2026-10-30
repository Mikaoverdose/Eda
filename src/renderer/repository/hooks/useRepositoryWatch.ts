import { useEffect } from "react";
import { useAppStore } from "../../stores/app-store";

export function useRepositoryWatch(enabled: boolean): void {
  const profileId = useAppStore((state) => state.activeIdentity?.id);
  const repository = useAppStore((state) =>
    state.repositories.find((item) => item.id === state.selectedRepositoryId),
  );
  const id = enabled && profileId && repository?.available ? repository.id : null;
  const path = id ? repository?.path : undefined;

  useEffect(() => {
    if (!id) return;
    void window.eda.repository.watch(id);
    return () => {
      void window.eda.repository.watch(null);
    };
  }, [id, path, profileId]);
}
