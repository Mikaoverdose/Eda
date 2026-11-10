import { errorMessage, type Result } from "@shared/errors";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRepositoryStore } from "../../stores/repository-store";

export function useReviewedOperation<T>(repositoryId: string, prepare: () => Promise<Result<T>>) {
  const [preview, setPreview] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);

  const review = useCallback(async () => {
    const request = ++revision.current;
    setBusy(true);
    setError(null);
    setPreview(null);

    try {
      const result = await prepare();
      if (request !== revision.current) return;

      if (result.ok) setPreview(result.value);
      else setError(errorMessage(result.error));
    } catch (error) {
      if (request === revision.current) setError(errorMessage(error));
    } finally {
      if (request === revision.current) setBusy(false);
    }
  }, [prepare]);

  useEffect(() => {
    void review();

    return () => {
      revision.current++;
    };
  }, [review]);

  const execute = async (
    operation: (preview: T) => Promise<Result<unknown>>,
    onSuccess: () => void,
  ) => {
    if (!preview || busy) return;

    const request = revision.current;
    setBusy(true);
    setError(null);

    try {
      const result = await operation(preview);
      if (request !== revision.current) return;

      if (useRepositoryStore.getState().repositoryId === repositoryId)
        await useRepositoryStore.getState().syncFromDisk();
      if (request !== revision.current) return;

      if (result.ok) onSuccess();
      else {
        setError(errorMessage(result.error));
        setPreview(null);
      }
    } catch (error) {
      if (request === revision.current) setError(errorMessage(error));
    } finally {
      if (request === revision.current) setBusy(false);
    }
  };

  return { preview, setPreview, busy, error, setError, review, execute };
}
